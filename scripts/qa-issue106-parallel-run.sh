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
source scripts/qa-issue106-worker-process-group.sh
ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC"
TOKEN_A="$(openssl rand -hex 32)"
TOKEN_B="$(openssl rand -hex 32)"
PIDA=""
PIDB=""
OVERLAP="$RUNNER_TEMP/qa106-parallel-d1-overlap.txt"
cleanup(){
  qa106_stop_worker_group "$PIDA" || true
  qa106_stop_worker_group "$PIDB" || true
  rm -f "$RUNNER_TEMP"/qa106-private-*.log "$RUNNER_TEMP"/qa106-private-*.json
}
trap cleanup EXIT
start_worker(){
  local slot="$1" port token pid job code ready=0
  if [[ "$slot" == A ]];then port=8787;token="$TOKEN_A"
  elif [[ "$slot" == B ]];then port=8788;token="$TOKEN_B"
  else echo "::error::QA106_INVALID_WORKER_SLOT";return 1;fi
  job="drive:$ROOT"
  job="${job}_qa_$slot"
  pid="$(qa106_spawn_worker_group "$RUNNER_TEMP/qa106-private-worker-$slot.log" \
    npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
    --ip 127.0.0.1 --port "$port" \
    --var "INGESTION_TOKEN:$token" \
    --var "GEMINI_API_KEY:$GEMINI_API_KEY" \
    --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:4" \
    --var "INGESTION_COORDINATOR_JOB_KEY:$job" \
    --var "INGESTION_COORDINATOR_ENABLED:true" \
    --var "INGESTION_GLOBAL_WRITE_GATE_ENABLED:true" \
    --var "INGESTION_IMMUTABLE_PUBLICATION_ENABLED:true")"
  if ! qa106_assert_worker_group "$pid"; then
    kill "$pid" 2>/dev/null || true
    return 1
  fi
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
  elif [[ "$slot" == B ]];then
    port=8788;token="$TOKEN_B";pdf="1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn"
  else echo "::error::QA106_INVALID_WORKER_SLOT";return 1
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
      recover)
        export QA106_MAP_RECOVERY_ONLY=true
        node scripts/drive-ingest.mjs;;
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
  # Actual chosen phase can advance ahead of the runner round label.
  # Observe lease overlap during ANY two-worker round, not only named Map.
  if [[ ! -f "$OVERLAP" ]];then probe_overlap || true;fi
  wait "$a" || failA=$?
  wait "$b" || failB=$?
  # Do NOT dump raw private logs: expose only reviewed codes, selected phase,
  # and per-process bounded reservation count on a failure.
  for slot in A B;do
    local rc=0
    if [[ "$slot" == A ]];then rc="$failA";else rc="$failB";fi
    if [[ "$rc" != 0 ]];then
      echo "::error::QA106_SLOT_${slot}_PROCESS_FAILED"
      node scripts/qa-issue106-safe-worker-error.mjs "$RUNNER_TEMP/qa106-private-$stage-$slot.log" || true
    fi
  done
  if [[ "$failA" == 0 && "$failB" == 0 ]];then
    echo "PASS: both Workers saved $stage phase"
    return 0
  fi
  # A round labelled 'raw' may have actually selected Map, after durable
  # RAW checkpoints. Only known Map timeout + actual selected=map qualify.
  # Unknown failure classes always fail closed: NO paid blind retry.
  for slot in A B;do
    local failed log
    if [[ "$slot" == A ]];then failed="$failA";else failed="$failB";fi
    log="$RUNNER_TEMP/qa106-private-$stage-$slot.log"
    if [[ "$failed" != 0 ]] &&
       ! node scripts/qa-issue106-map-retry-gate.mjs "$failed" "$log";then
      echo "::error::QA106_NONRECOVERABLE_PHASE_$stage"_$slot;return 1
    fi
  done
  echo "PASS: actual selected Map timeout is eligible for model-free receipt reconciliation"
  for retry in 1 2 3;do
    sleep 30
    for slot in A B;do
      local rc=0
      if [[ "$slot" == A && "$failA" == 0 ||
            "$slot" == B && "$failB" == 0 ]];then continue;fi
      # Recovery-only mode forbids new Gemini and Workers AI work even if
      # a missing/changed D1 pending intent is detected.
      run_slot "$slot" recover > "$RUNNER_TEMP/qa106-private-map-retry-$slot.log" 2>&1 || rc=$?
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
qa106_stop_worker_group "$PIDA"
PIDA=""
stopped=0
for attempt in $(seq 1 20);do
  codeA=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 \
    -X POST -H "Authorization: Bearer $TOKEN_A" \
    -H "Content-Type: application/json" --data '{"action":"status"}' \
    "http://127.0.0.1:8787/api/drive-ingest-batch" 2>/dev/null || true)
  if [[ "$codeA" != 200 ]];then stopped=1;break;fi
  sleep 1
done
if [[ "$stopped" != 1 ]];then
  echo "::error::QA106_WORKER_A_DID_NOT_ACTUALLY_STOP";exit 1
fi
codeB=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
  -X POST -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" --data '{"action":"status"}' \
  "http://127.0.0.1:8788/api/drive-ingest-batch" 2>/dev/null || true)
if [[ "$codeB" != 200 ]];then
  echo "::error::QA106_WORKER_B_INTERRUPTED_BY_A_RESTART";exit 1
fi
start_worker A
echo "PASS: Worker A was genuinely stopped and restarted at checkpoint; Worker B remained available"
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
