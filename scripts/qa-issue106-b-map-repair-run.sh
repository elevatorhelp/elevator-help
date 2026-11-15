#!/usr/bin/env bash
# Owner-approved ONE-TIME <=4-Gemini-call QA repair of Map PDF B ONLY.
# No A worker, no RAW/Evidence generation, no retry, no Production deployment.
set -Eeuo pipefail
umask 077
for key in GITHUB_RUN_ID RUNNER_TEMP CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID GOOGLE_SERVICE_ACCOUNT_JSON GEMINI_API_KEY QA106_B_MAP_REPAIR_CONFIRMATION;do
  if [[ -z "$(printenv "$key")" ]];then
    echo "::error::QA106_B_REPAIR_REQUIRED_ENV_MISSING";exit 1
  fi
done
if [[ "${GITHUB_ACTIONS:-}" != true ||
      "${GITHUB_EVENT_NAME:-}" != workflow_dispatch ||
      "${GITHUB_REF:-}" != refs/heads/main ||
      "$QA106_B_MAP_REPAIR_CONFIRMATION" != QA106_B_ONLY_MAX_4_GEMINI_CALLS ]];then
  echo "::error::QA106_B_REPAIR_CONTEXT_DENIED";exit 1
fi
export QA106_CONFIRMATION=QA_ONLY_TWO_PDFS_MAX_24_GEMINI_CALLS
source scripts/qa-issue106-worker-process-group.sh
ROOT=1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC
PDF_B=1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn
TOKEN="$(openssl rand -hex 32)"
JOB="drive:${ROOT}_qa_B"
pid=""
cleanup(){
  qa106_stop_worker_group "$pid" || true
  rm -f "$RUNNER_TEMP"/qa106-b-repair-private-*.log
}
trap cleanup EXIT
pid="$(qa106_spawn_worker_group "$RUNNER_TEMP/qa106-b-repair-private-worker.log" \
  npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
  --ip 127.0.0.1 --port 8788 \
  --var "INGESTION_TOKEN:$TOKEN" \
  --var "GEMINI_API_KEY:$GEMINI_API_KEY" \
  --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:4" \
  --var "QA106_B_MAP_REPAIR_ENABLED:true" \
  --var "INGESTION_COORDINATOR_JOB_KEY:$JOB" \
  --var "INGESTION_COORDINATOR_ENABLED:true" \
  --var "INGESTION_GLOBAL_WRITE_GATE_ENABLED:true" \
  --var "INGESTION_IMMUTABLE_PUBLICATION_ENABLED:true")"
if ! qa106_assert_worker_group "$pid";then
  echo "::error::QA106_B_REPAIR_WORKER_GROUP_INVALID";exit 1
fi
ready=0
for i in $(seq 1 75);do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
    -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" --data '{"action":"status"}' \
    http://127.0.0.1:8788/api/drive-ingest-batch 2>/dev/null || true)"
  if [[ "$code" == 200 ]];then ready=1;break;fi
  if ! kill -0 "$pid" 2>/dev/null;then break;fi
  sleep 2
done
if [[ "$ready" != 1 ]];then
  echo "::error::QA106_B_REPAIR_WORKER_NOT_READY";exit 1
fi
echo "PASS: isolated QA Worker B online; A was never launched"
(
  export QA_V2_INGESTION_TOKEN="$TOKEN"
  export ELEVATOR_INGESTION_TOKEN="$TOKEN"
  export QA_V2_JOB_KEY="$JOB"
  export DRIVE_FOLDER_ID="$ROOT"
  export INGESTION_V2_QA_DRIVE_ROOT="$ROOT"
  export INGESTION_V2_QA_MODE=true
  export INGESTION_V2_QA_PARALLEL_MODE=true
  export INGESTION_V2_QA_PARALLEL_SLOT=B
  export INGESTION_V2_QA_PARALLEL_FILE_ID="$PDF_B"
  export INGESTION_V2_QA_PARALLEL_CONFIRMATION="$QA106_CONFIRMATION"
  export INGESTION_D1_COORDINATOR_MODE=strict
  export INGESTION_D1_EXPLICIT_RUN_ID="$GITHUB_RUN_ID"
  export INGESTION_V2_QA_ORIGIN=http://127.0.0.1:8788
  export INGEST_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/drive-ingest-batch"
  export DOCUMENT_MAP_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/document-map-ingest"
  export INGESTION_COORDINATOR_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/ingestion-coordinator"
  export INGESTION_IMMUTABLE_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/immutable-archive-publish"
  export QA106_B_MAP_REPAIR_ONLY=true
  export MAX_FILES=1 MAX_GEMINI_CALLS=4
  export STATE_PATH="$RUNNER_TEMP/qa106-b-repair-cache.json"
  # One process, one window, and NO automatic retry after a paid failure.
  node scripts/drive-ingest.mjs > "$RUNNER_TEMP/qa106-b-repair-private-ingest.log" 2>&1
) || {
  echo "::error::QA106_B_REPAIR_INGEST_OR_PUBLISH_FAILED"
  node scripts/qa-issue106-safe-worker-error.mjs \
     "$RUNNER_TEMP/qa106-b-repair-private-ingest.log" || true
  exit 1
}
(
  export QA_V2_INGESTION_TOKEN="$TOKEN"
  export ELEVATOR_INGESTION_TOKEN="$TOKEN"
  export QA_V2_JOB_KEY="$JOB"
  export DRIVE_FOLDER_ID="$ROOT"
  export INGESTION_V2_QA_DRIVE_ROOT="$ROOT"
  export INGESTION_V2_QA_MODE=true
  export INGESTION_V2_QA_PARALLEL_MODE=true
  export INGESTION_V2_QA_PARALLEL_SLOT=B
  export INGESTION_V2_QA_PARALLEL_FILE_ID="$PDF_B"
  export INGESTION_V2_QA_PARALLEL_CONFIRMATION="$QA106_CONFIRMATION"
  export INGESTION_D1_COORDINATOR_MODE=strict
  export INGESTION_D1_EXPLICIT_RUN_ID="$GITHUB_RUN_ID"
  export INGESTION_V2_QA_ORIGIN=http://127.0.0.1:8788
  export MAX_FILES=1 MAX_GEMINI_CALLS=4
  node scripts/qa-issue106-worker-checkpoint.mjs attest
)
printf '%s\n' \
  QA106_B_ONLY_EXACT_MAP_REPAIR_PASS \
  QA106_B_ONLY_BOTH_PHYSICAL_INDEXES_VERIFIED \
  QA106_B_ONLY_IMMUTABLE_PUBLICATION_ATTESTED \
  QA106_B_ONLY_GEMINI_CALL_CAP_FOUR \
  > "$RUNNER_TEMP/qa106-b-repair-proof.txt"
echo "PASS: B alone published exact original Map IDs and verified immutable three-layer manifest"
