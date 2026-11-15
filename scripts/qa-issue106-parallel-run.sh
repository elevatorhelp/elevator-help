#!/usr/bin/env bash
# Manually dispatched, bounded and isolated two-PDF QA run. NEVER Production.
set -Eeuo pipefail
umask 077
for required in GITHUB_RUN_ID RUNNER_TEMP CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID GOOGLE_SERVICE_ACCOUNT_JSON GEMINI_API_KEY QA106_CONFIRMATION;do
  if [[ -z "$(printenv "$required")" ]];then echo "::error::QA106_REQUIRED_ENV_MISSING";exit 1;fi
done
if [[ "$GITHUB_EVENT_NAME" != workflow_dispatch ||
      "$GITHUB_REF" != refs/heads/main ||
      "$QA106_CONFIRMATION" != QA_ONLY_TWO_PDFS_MAX_24_GEMINI_CALLS ]];then
  echo "::error::QA106_NOT_AUTHORIZED";exit 1
fi
ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC"
TOKEN_A="$(openssl rand -hex 32)"
TOKEN_B="$(openssl rand -hex 32)"
PIDA=""
PIDB=""
OVERLAP="$RUNNER_TEMP/qa106-parallel-d1-overlap.txt"
cleanup(){
  if [[ -n "$PIDA" ]];then kill "$PIDA" 2>/dev/null || true;fi
  if [[ -n "$PIDB" ]];then kill "$PIDB" 2>/dev/null || true;fi
  rm -f "$RUNNER_TEMP"/qa106-private-*.log "$RUNNER_TEMP"/qa106-private-*.json
}
trap cleanup EXIT
start_worker(){
  local slot="$1" port token pid job code ready=0
  if [[ "$slot" == A ]];then port=8787;token="$TOKEN_A"
  else port=8788;token="$TOKEN_B";fi
  job="drive:$ROOT"
  job="${job}_qa_$slot"
  npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
    --ip 127.0.0.1 --port "$port" \
    --var "INGESTION_TOKEN:$token" \
    --var "GEMINI_API_KEY:$GEMINI_API_KEY" \
    --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:4" \
    --var "INGESTION_COORDINATOR_JOB_KEY:$job" \
    --var "INGESTION_COORDINATOR_ENABLED:true" \
    --var "INGESTION_GLOBAL_WRITE_GATE_ENABLED:true" \
    --var "INGESTION_IMMUTABLE_PUBLICATION_ENABLED:true" \
    > "$RUNNER_TEMP/qa106-private-worker-$slot.log" 2>&1 &
  pid=$!
  if [[ "$slot" == A ]];then PIDA="$pid";else PIDB="$pid";fi
  for attempt in $(seq 1 75);do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
      -X POST -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" --data '{"action":"status"}' \
      "http://127.0.0.1:$port/api/drive-ingest-batch" 2>/dev/null || true)
    if [[ "$code" == 200 ]];then ready=1;break;fi
    if ! kill -0 "$pid" 2>/dev/null;then break;fi
    sleep 2
  done
  if [[ "$ready" != 1 ]];then echo "::error::QA106_WORKER_NOT_READY_$slot";return 1;fi
  echo "PASS: QA Worker $slot online"
}
run_slot(){
  local slot="$1" command="$2" port token pdf
  if [[ "$slot" == A ]];then
    port=8787;token="$TOKEN_A";pdf="1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v"
  else
    port=8788;token="$TOKEN_B";pdf="1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn"
  fi
  (
    export QA_V2_INGESTION_TOKEN="$token"
    export ELEVATOR_INGESTION_TOKEN="$token"
    export QA_V2_JOB_KEY="drive:$ROOT" 
    export QA_V2_JOB_KEY="$QA_V2_JOB_KEY"_qa_"$slot"
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
    export MAX_FILES=1
    export MAX_GEMINI_CALLS=4
    export STATE_PATH="$RUNNER_TEMP/qa106-cache-$slot.json"
    case "$command" in
      seed) node scripts/qa-issue106-worker-checkpoint.mjs seed;;
      ingest) node scripts/drive-ingest.mjs;;
      attest) node scripts/qa-issue106-worker-checkpoint.mjs attest;;
      *) exit 2;;
    esac
  )
}
probe_overlap(){
  local out="$RUNNER_TEMP/qa106-private-d1-overlap.json"
  local sql="SELECT COUNT(*) AS n FROM ingestion_global_leases WHERE job_key IN ('drive:$ROOT"
  sql="$sql""_qa_A','drive:$ROOT"
  sql="$sql""_qa_B') AND lease_until_ms > CAST(strftime('%s','now') AS INTEGER)*1000;"
  for i in $(seq 1 20);do
    if npx wrangler d1 execute elevator-help-lease-test-01 \
       --remote --config wrangler.qa-pr100-v2.json --json --command "$sql" \
       > "$out" 2>/dev/null;then
      local num
      num=$(node -e 'let x=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));x=Array.isArray(x)?x:[x];console.log(x.flatMap(a=>a.results||[])[0]?.n||0)' "$out" 2>/dev/null||echo 0)
      if [[ "$num" == 2 ]];then
        echo "QA106_TWO_LEASES_CONCURRENT_PASS" > "$OVERLAP"
        echo "PASS: observed two active independent D1 owner leases"
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}
phase(){
  local stage="$1" a b failA=0 failB=0
  echo "QA phase $stage: starting two independent PDF processes"
  run_slot A ingest > "$RUNNER_TEMP/qa106-private-$stage-A.log" 2>&1 &
  a=$!
  run_slot B ingest > "$RUNNER_TEMP/qa106-private-$stage-B.log" 2>&1 &
  b=$!
  if [[ "$stage" == map && ! -f "$OVERLAP" ]];then probe_overlap || true;fi
  wait "$a" || failA=$?
  wait "$b" || failB=$?
  if [[ "$failA" == 0 && "$failB" == 0 ]];then
    echo "PASS: both Workers saved $stage phase"
    return 0
  fi
  if [[ "$stage" != map ]];then
    echo "::error::QA106_EVIDENCE_OR_RAW_FAILED";return 1
  fi
  # Late Vectorize readback: retry only known pending-ID states. The #104
  # runner reconciles before GEMINI budget and never recomputes them.
  for slot in A B;do
    local failed log
    if [[ "$slot" == A ]];then failed="$failA";else failed="$failB";fi
    log="$RUNNER_TEMP/qa106-private-map-$slot.log"
    if [[ "$failed" != 0 ]] &&
      ! grep -Eq 'V2_MAP_(VECTOR_READBACK_TIMEOUT|PENDING_VECTOR_READBACK)' "$log";then
      echo "::error::QA106_NONRECOVERABLE_MAP_$slot";return 1
    fi
  done
  for retry in 1 2 3;do
    sleep 30
    for slot in A B;do
      local rc=0
      if [[ "$slot" == A && "$failA" == 0 ||
            "$slot" == B && "$failB" == 0 ]];then continue;fi
      run_slot "$slot" ingest > "$RUNNER_TEMP/qa106-private-map-retry-$slot.log" 2>&1 || rc=$?
      if [[ "$slot" == A ]];then failA="$rc";else failB="$rc";fi
      if [[ "$rc" != 0 ]] &&
        ! grep -q "V2_MAP_PENDING_VECTOR_READBACK" "$RUNNER_TEMP/qa106-private-map-retry-$slot.log";then
        echo "::error::QA106_MAP_RECOVERY_REJECTED_$slot";return 1
      fi
    done
    if [[ "$failA" == 0 && "$failB" == 0 ]];then
      echo "PASS: late Map vectors recovered from existing IDs without re-running Gemini"
      return 0
    fi
  done
  echo "::error::QA106_PENDING_MAP_NOT_VISIBLE";return 1
}
start_worker A
start_worker B
run_slot A seed
run_slot B seed
phase evidence
# Real QA Worker A runtime is restarted between durable stages, B stays online.
kill "$PIDA" 2>/dev/null || true
wait "$PIDA" 2>/dev/null || true
PIDA=""
start_worker A
echo "PASS: restarted QA Worker A at Evidence checkpoint while B stayed online"
phase raw
phase map
if [[ ! -s "$OVERLAP" ]];then
  echo "::error::QA106_NO_SIMULTANEOUS_D1_LEASE";exit 1
fi
run_slot A attest
run_slot B attest
printf '%s\n' \
  "QA106_REAL_TWO_PDF_PARALLEL_PUBLICATION_PASS" \
  "QA106_TWO_LEASES_CONCURRENT_PASS" \
  "QA106_WORKER_A_RESTART_PASS" \
  "QA106_MAX_24_RESERVED_GEMINI_CALLS" \
  > "$RUNNER_TEMP/qa106-success-summary.txt"
echo "PASS: two different real Google Drive PDFs published from concurrent QA Workers"
