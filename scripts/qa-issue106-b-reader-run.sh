#!/usr/bin/env bash
# Issue106 one-shot billed QA B ONLY, never Production and never automatic.
set -Eeuo pipefail
umask 077
if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${GITHUB_EVENT_NAME:-}" != push ||
      "${GITHUB_REF:-}" != refs/heads/feat/issue106-shadow-map-revision-20261122 ||
      "${QA106_B_SHADOW_CONFIRMATION:-}" != QA106_B_GENERIC_READER_NO_MODEL ||
      ! "${GITHUB_RUN_ID:-}" =~ ^[1-9][0-9]{5,19}$ ]]; then
  echo "::error::QA106_B_SHADOW_NOT_OWNER_APPROVED";exit 1
fi
for k in GOOGLE_SERVICE_ACCOUNT_JSON CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID RUNNER_TEMP; do
  [[ -n "$(printenv "$k")" ]] || { echo "::error::QA106_B_SHADOW_REQUIRED_ENV_MISSING";exit 1; }
done
# No Gemini or Workers AI credentials; recovery is durable-vector readback only.
if [[ -n "${GEMINI_API_KEY:-}" || -n "${GEMINI_BENCHMARK_API_KEY:-}" ]];then
 echo "::error::QA106_RECOVERY_MODEL_SECRET_DENIED";exit 1
fi
# Never start a non-QA configured worker or use any real archive endpoint.
node --input-type=module - <<'NODE'
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
if(c.d1_databases?.length!==1||
 c.d1_databases[0].database_id!=="02716877-15e3-4478-9e24-f1ba6e5dfb00"||
 c.d1_databases[0].database_name!=="elevator-help-lease-test-01"||
 c.vectorize?.length!==2||
 c.vectorize[0].index_name!=="elevator-help-staging-test"||
 c.vectorize[1].index_name!=="elevator-help-staging-test-v2"||
 c.vars?.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only"||
 c.vars?.QA106_B_MAP_REVISION_SHADOW_ENABLED!=="false")
 throw Error("QA106_B_SHADOW_UNSAFE_WORKER_CONFIG");
NODE
source scripts/qa-issue106-worker-process-group.sh
TMP="$(mktemp -d "$RUNNER_TEMP/qa106-b-shadow-private.XXXXXXXX")"
pid=""
cleanup() {
  local rc="$?"
  qa106_stop_worker_group "$pid" || rc=1
  rm -rf "$TMP"
  exit "$rc"
}
trap cleanup EXIT
TOKEN="$(openssl rand -hex 32)"
JOB="drive:1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC_qa_B"
pid="$(qa106_spawn_worker_group "$TMP/worker.log" \
  npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
  --ip 127.0.0.1 --port 8788 \
  --var "INGESTION_TOKEN:$TOKEN" \
   --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:0" \
  --var "QA106_B_MAP_REVISION_SHADOW_ENABLED:true" \
  --var "QA106_ISOLATED_BINDINGS:qa106-pr100-v2-only" \
  --var "INGESTION_COORDINATOR_JOB_KEY:$JOB" \
  --var "INGESTION_COORDINATOR_ENABLED:true" \
  --var "INGESTION_GLOBAL_WRITE_GATE_ENABLED:true" \
  --var "INGESTION_IMMUTABLE_PUBLICATION_ENABLED:true")"
qa106_assert_worker_group "$pid"
ready=0
for n in $(seq 1 75); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
     -X POST -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' --data '{"action":"status"}' \
     http://127.0.0.1:8788/api/drive-ingest-batch 2>/dev/null || true)"
  if [[ "$code" == 200 ]];then ready=1;break;fi
  if ! kill -0 "$pid" 2>/dev/null;then break;fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo "::error::QA106_B_SHADOW_QA_WORKER_NOT_READY";exit 1; }
echo "PASS:QA106_B_SHADOW_ISOLATED_WORKER_READY"
export QA_V2_INGESTION_TOKEN="$TOKEN"
export QA_V2_JOB_KEY="$JOB"
export DRIVE_FOLDER_ID=1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC
export INGESTION_V2_QA_MODE=true
export QA106_CONFIRMATION=QA_ONLY_TWO_PDFS_MAX_24_GEMINI_CALLS
export INGESTION_V2_QA_ORIGIN=http://127.0.0.1:8788
export MAX_GEMINI_CALLS=0
node scripts/qa-issue106-b-reader-client.mjs
echo "PASS:QA106_B_GENERIC_READER_QA_FINISHED"
