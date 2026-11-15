#!/usr/bin/env bash
# Owner-triggered isolated QA Map receipt reconciliation, with ZERO Gemini key.
# It NEVER launches the paid E2E runner, RAW generation or any model call.
set -Eeuo pipefail
umask 077
for required in GITHUB_RUN_ID RUNNER_TEMP CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID GOOGLE_SERVICE_ACCOUNT_JSON QA106_MAP_ONLY_CONFIRMATION;do
  if [[ -z "$(printenv "$required")" ]];then
    echo "::error::QA106_MAP_ONLY_ENV_MISSING";exit 1
  fi
done
if [[ "$GITHUB_ACTIONS" != true ||
      "$GITHUB_EVENT_NAME" != workflow_dispatch ||
      "$GITHUB_REF" != refs/heads/main ||
      "$QA106_MAP_ONLY_CONFIRMATION" != QA106_MAP_RECOVERY_NO_GEMINI ]];then
  echo "::error::QA106_MAP_ONLY_NOT_AUTHORIZED";exit 1
fi
# Never inherit model credentials from runners or repository settings.
unset GEMINI_API_KEY GEMINI_BENCHMARK_API_KEY
export QA106_CONFIRMATION=QA_ONLY_TWO_PDFS_MAX_24_GEMINI_CALLS
source scripts/qa-issue106-worker-process-group.sh
ROOT=1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC
TOKEN_A="$(openssl rand -hex 32)"
TOKEN_B="$(openssl rand -hex 32)"
PIDA="" PIDB=""
cleanup(){
  qa106_stop_worker_group "$PIDA" || true
  qa106_stop_worker_group "$PIDB" || true
  rm -f "$RUNNER_TEMP"/qa106-map-only-private-*.log
}
trap cleanup EXIT
start_worker(){
  local slot="$1" port token job pid code ready=0
  if [[ "$slot" == A ]];then port=8787;token="$TOKEN_A"
  elif [[ "$slot" == B ]];then port=8788;token="$TOKEN_B"
  else return 1;fi
  job="drive:${ROOT}_qa_${slot}"
  pid="$(qa106_spawn_worker_group "$RUNNER_TEMP/qa106-map-only-private-worker-$slot.log" \
    npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
    --ip 127.0.0.1 --port "$port" \
    --var "INGESTION_TOKEN:$token" \
    --var "INGESTION_COORDINATOR_JOB_KEY:$job" \
    --var "INGESTION_COORDINATOR_ENABLED:true" \
    --var "INGESTION_GLOBAL_WRITE_GATE_ENABLED:true" \
    --var "INGESTION_IMMUTABLE_PUBLICATION_ENABLED:true")"
  if ! qa106_assert_worker_group "$pid";then
    kill "$pid" 2>/dev/null || true;return 1
  fi
  if [[ "$slot" == A ]];then PIDA="$pid";else PIDB="$pid";fi
  for attempt in $(seq 1 75);do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
      -X POST -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" --data '{"action":"status"}' \
      "http://127.0.0.1:$port/api/drive-ingest-batch" 2>/dev/null || true)"
    if [[ "$code" == 200 ]];then ready=1;break;fi
    if ! kill -0 "$pid" 2>/dev/null;then break;fi
    sleep 2
  done
  if [[ "$ready" != 1 ]];then echo "::error::QA106_MAP_ONLY_WORKER_NOT_READY_$slot";return 1;fi
  echo "PASS: QA Map-only Worker $slot online (no Gemini key provided)"
}
run_slot(){
  local slot="$1" command="$2" port token pdf
  if [[ "$slot" == A ]];then
    port=8787;token="$TOKEN_A";pdf=1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v
  elif [[ "$slot" == B ]];then
    port=8788;token="$TOKEN_B";pdf=1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn
  else return 1;fi
  (
    unset GEMINI_API_KEY GEMINI_BENCHMARK_API_KEY
    export QA_V2_INGESTION_TOKEN="$token"
    export ELEVATOR_INGESTION_TOKEN="$token"
    export QA_V2_JOB_KEY="drive:${ROOT}_qa_${slot}"
    export DRIVE_FOLDER_ID="$ROOT"
    export INGESTION_V2_QA_DRIVE_ROOT="$ROOT"
    export INGESTION_V2_QA_MODE=true
    export INGESTION_V2_QA_PARALLEL_MODE=true
    export INGESTION_V2_QA_PARALLEL_SLOT="$slot"
    export INGESTION_V2_QA_PARALLEL_FILE_ID="$pdf"
    export INGESTION_V2_QA_PARALLEL_CONFIRMATION="$QA106_CONFIRMATION"
    export INGESTION_D1_COORDINATOR_MODE=strict
    export INGESTION_D1_EXPLICIT_RUN_ID="$GITHUB_RUN_ID"
    export INGESTION_V2_QA_ORIGIN="http://127.0.0.1:$port"
    export INGEST_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/drive-ingest-batch"
    export DOCUMENT_MAP_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/document-map-ingest"
    export INGESTION_COORDINATOR_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/ingestion-coordinator"
    export INGESTION_IMMUTABLE_ENDPOINT="$INGESTION_V2_QA_ORIGIN/api/immutable-archive-publish"
    export QA106_MAP_RECOVERY_ONLY=true
    export MAX_FILES=1 MAX_GEMINI_CALLS=1
    export STATE_PATH="$RUNNER_TEMP/qa106-map-only-cache-$slot.json"
    case "$command" in
      recover) node scripts/drive-ingest.mjs;;
      attest) node scripts/qa-issue106-worker-checkpoint.mjs attest;;
      *) exit 2;;
    esac
  )
}
start_worker A
start_worker B
for attempt in 1 2 3;do
  a=0 b=0
  run_slot A recover > "$RUNNER_TEMP/qa106-map-only-private-A.log" 2>&1 || a=$?
  run_slot B recover > "$RUNNER_TEMP/qa106-map-only-private-B.log" 2>&1 || b=$?
  if [[ "$a" == 0 && "$b" == 0 ]];then
    echo "PASS: both pending Map windows recovered without Gemini"
    run_slot A attest
    run_slot B attest
    printf '%s\n' \
      QA106_MAP_ONLY_TWO_PDF_PUBLICATION_PASS \
      QA106_MAP_ONLY_NO_GEMINI_SECRET_PROVIDED \
      QA106_MAP_ONLY_BOTH_MANIFESTS_ATTESTED \
      > "$RUNNER_TEMP/qa106-map-only-proof.txt"
    echo "PASS: both previously staged PDF manifests published and attested (no model keys supplied)"
    exit 0
  fi
  for slot in A B;do
    local_code="$a"
    if [[ "$slot" == B ]];then local_code="$b";fi
    if [[ "$local_code" != 0 ]];then
      echo "::warning::QA106_MAP_ONLY_SLOT_${slot}_PENDING_OR_FAILED"
      node scripts/qa-issue106-safe-worker-error.mjs \
        "$RUNNER_TEMP/qa106-map-only-private-$slot.log" || true
      # Retry ONLY a still-pending Vectorize pair; every other error aborts.
      if ! grep -q "V2_MAP_PENDING_VECTOR_READBACK" \
           "$RUNNER_TEMP/qa106-map-only-private-$slot.log";then
        echo "::error::QA106_MAP_ONLY_NONRECOVERABLE_$slot";exit 1
      fi
    fi
  done
  if [[ "$attempt" == 3 ]];then break;fi
  sleep 30
done
echo "::error::QA106_MAP_ONLY_PENDING_VECTOR_READBACK"
exit 1
