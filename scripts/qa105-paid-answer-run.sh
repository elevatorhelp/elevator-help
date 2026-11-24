#!/usr/bin/env bash
# Issue105 manual isolated positive Clerk TEST+Vectorize QA proof; no model.
set -Eeuo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true &&
   ( "${GITHUB_EVENT_NAME:-}" == workflow_dispatch ||
     ( "${GITHUB_EVENT_NAME:-}" == push &&
       "${QA105_POSITIVE_EVENT_TRIGGER:-}" == "qa105(approved paid): exact DE IT fixture max two Gemini calls" ) ) &&
   "${GITHUB_REF:-}" == refs/heads/feat/issue106-shadow-map-revision-20261122 &&
   "${QA105_POSITIVE_CONFIRMATION:-}" == qa105-20261124-two-calls-v2 &&
   -n "${QA105_PAID_GEMINI_KEY:-}" &&
   -z "${GEMINI_API_KEY:-}" &&
   -z "${GEMINI_BENCHMARK_API_KEY:-}" &&
   -z "${CLERK_SECRET_KEY:-}" ]] || {
 echo "::error::QA105_POSITIVE_CONTEXT_DENIED";exit 1
}
for key in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID RUNNER_TEMP
 do [[ -n "$(printenv "$key")" ]] || {
 echo "::error::QA105_POSITIVE_QA_ENV_MISSING";exit 1; }; done
test -s .open-next/worker.js
ROOT="$(mktemp -d "$RUNNER_TEMP/qa105-clerk-test.XXXXXXXX")"
export QA105_PRIVATE_DEV_VARS="$ROOT/.dev.vars"
source scripts/qa-issue106-worker-process-group.sh
pid=""
cleanup(){
 local rc="$?"
 trap - EXIT
 [[ -z "$pid" ]] || qa106_stop_worker_group "$pid" || rc=1
 rm -f .dev.vars
 rm -rf "$ROOT"
 exit "$rc"
}
trap cleanup EXIT
[[ ! -e .dev.vars && ! -L .dev.vars ]] || {
 echo "::error::QA105_POSITIVE_EXISTING_DEV_VARS_DENIED";exit 1
}
node scripts/qa105-paid-answer-probe.mjs preflight
node scripts/qa105-paid-answer-probe.mjs prepare-vars
ln -s "$QA105_PRIVATE_DEV_VARS" .dev.vars
# No real Clerk secret or JWT on process command lines. QA-only bindings.
pid="$(qa106_spawn_worker_group "$ROOT/worker.log" \
 npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
 --ip 127.0.0.1 --port 8797)"
qa106_assert_worker_group "$pid"
# On the first request the Worker can return 503 while cold-starting;
# the preflight remains model-free and avoids exposing any authorization.
ready=0
for i in $(seq 1 75);do
  code="$(curl -sS --max-time 4 -o /dev/null -w '%{http_code}' \
   -X POST -H 'Content-Type: application/json' \
   --data '{"language":"de"}' \
   http://127.0.0.1:8797/api/ask 2>/dev/null || true)"
  if [[ "$code" == 401 ]];then ready=1;break;fi
  if ! kill -0 "$pid" 2>/dev/null;then break;fi
  sleep 2
done
[[ "$ready" == 1 ]] || {
 echo "::error::QA105_POSITIVE_AUTH_WORKER_NOT_READY";exit 1
}
node scripts/qa105-paid-answer-probe.mjs probe
echo "PASS:QA105_BOUNDED_PAID_PROBE_FINISHED"
