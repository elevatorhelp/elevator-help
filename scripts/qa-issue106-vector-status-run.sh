#!/usr/bin/env bash
# One-shot on protected main: read-only QA Vectorize + D1 diagnosis.
# Runs a temporary Cloudflare dev worker; NEVER production or Gemini.
set -Eeuo pipefail
umask 077
if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${GITHUB_EVENT_NAME:-}" != push ||
      "${GITHUB_REF:-}" != refs/heads/main ||
      -z "${CLOUDFLARE_API_TOKEN:-}" ||
      -z "${CLOUDFLARE_ACCOUNT_ID:-}" ||
      -z "${RUNNER_TEMP:-}" ]];then
  echo "::error::QA106_VECTOR_DIAG_CONTEXT_DENIED";exit 1
fi
unset GEMINI_API_KEY GEMINI_BENCHMARK_API_KEY
source scripts/qa-issue106-worker-process-group.sh
token="$(openssl rand -hex 32)"
log="$RUNNER_TEMP/qa106-vector-diag-private.log"
respA="$RUNNER_TEMP/qa106-vector-diag-A.json"
respB="$RUNNER_TEMP/qa106-vector-diag-B.json"
pid=""
cleanup(){
  qa106_stop_worker_group "$pid" || true
  rm -f "$log" "$respA" "$respB"
}
trap cleanup EXIT
pid="$(qa106_spawn_worker_group "$log" \
  npx wrangler dev --remote --config wrangler.qa106-vector-readonly.json \
  --ip 127.0.0.1 --port 8791 \
  --var "DIAG_TOKEN:$token")"
qa106_assert_worker_group "$pid" || {
  echo "::error::QA106_VECTOR_DIAG_PROCESS_GROUP_DENIED";exit 1
}
ready=0
for i in $(seq 1 60);do
  # Endpoint rejects GET as 404. Use unauthenticated POST to verify that
  # the exact ephemeral Worker responds 403 BEFORE attempting any D1 reads.
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 \
    -X POST -H "Content-Type: application/json" \
    --data '{"slot":"A"}' \
    http://127.0.0.1:8791/inspect 2>/dev/null || true)"
  if [[ "$code" == 403 ]];then ready=1;break;fi
  if ! kill -0 "$pid" 2>/dev/null;then break;fi
  sleep 2
done
if [[ "$ready" != 1 ]];then echo "::error::QA106_VECTOR_DIAG_WORKER_UNAVAILABLE";exit 1;fi
for slot in A B;do
  if [[ "$slot" == A ]];then out="$respA";else out="$respB";fi
  if ! curl -fsS --max-time 45 -X POST \
     -H "Authorization: Bearer $token" \
     -H "Content-Type: application/json" \
     --data "{\"slot\":\"$slot\"}" \
     http://127.0.0.1:8791/inspect > "$out" 2>/dev/null;then
    echo "::error::QA106_VECTOR_DIAG_LOOKUP_FAILED_$slot";exit 1
  fi
  node scripts/qa-issue106-vector-status-report.mjs "$slot" "$out"
done
echo "QA106_VECTOR_INDEX_READONLY_DIAGNOSTIC_PASS"
