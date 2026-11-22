#!/usr/bin/env bash
# REAL Cloudflare QA: two independent remote Worker processes + D1 leases.
# NO ingestion, Gemini/Workers AI providers, Vectorize mutation or Production.
set -Eeuo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true &&
   "${GITHUB_EVENT_NAME:-}" == push &&
   "${GITHUB_REF:-}" == refs/heads/feat/issue106-shadow-map-revision-20261122 &&
   "${QA106_PARALLEL_CONFIRMATION:-}" == QA106_TWO_QA_COORDINATORS_NO_MODEL &&
   "${GITHUB_RUN_ID:-}" =~ ^[1-9][0-9]{5,19}$ &&
   -z "${GEMINI_API_KEY:-}" &&
   -z "${GEMINI_BENCHMARK_API_KEY:-}" ]] || {
  echo "::error::QA106_PARALLEL_CONTEXT_DENIED";exit 1
}
for k in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID RUNNER_TEMP;do
 [[ -n "$(printenv "$k")" ]] || {
  echo "::error::QA106_PARALLEL_QA_ENV_MISSING";exit 1
 }
done
test -s .open-next/worker.js
node --input-type=module - <<'NODE'
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
if(c.d1_databases?.length!==1||
 c.d1_databases[0].database_name!=="elevator-help-lease-test-01"||
 c.d1_databases[0].database_id!=="02716877-15e3-4478-9e24-f1ba6e5dfb00"||
 c.vectorize?.length!==2||
 c.vectorize[0].index_name!=="elevator-help-staging-test"||
 c.vectorize[1].index_name!=="elevator-help-staging-test-v2"||
 c.vars?.QA106_B_MAP_REVISION_SHADOW_ENABLED!=="false")
 throw Error("QA106_PARALLEL_WRONG_QA_BINDINGS");
NODE
TMP="$(mktemp -d "$RUNNER_TEMP/qa106-real-parallel.XXXXXXXX")"
PIDA="" PIDB=""
source scripts/qa-issue106-worker-process-group.sh
cleanup(){
 local rc="$?"
 trap - EXIT
 if [[ -n "$PIDA" ]];then qa106_stop_worker_group "$PIDA" || rc=1;fi
 if [[ -n "$PIDB" ]];then qa106_stop_worker_group "$PIDB" || rc=1;fi
 rm -rf "$TMP"
 exit "$rc"
}
trap cleanup EXIT
export QA106_PARALLEL_STATE_PATH="$TMP/state.json"
export QA106_PARALLEL_TOKEN_A="$(openssl rand -hex 32)"
export QA106_PARALLEL_TOKEN_B="$(openssl rand -hex 32)"
ROOT=1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC
before="SELECT (SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id='1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v') AS a_pub,
(SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id='1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn') AS b_pub,
(SELECT COUNT(*) FROM ingestion_v2_map_revision_activations WHERE document_id='1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn' AND state='active') AS b_generic,
(SELECT COUNT(*) FROM qa106_map_revision_shadow_publications WHERE document_id='1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn') AS b_shadow,
(SELECT COUNT(*) FROM qa106_map_revision_receipts WHERE document_id='1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn') AS b_receipts;"
npx wrangler d1 execute elevator-help-lease-test-01 --config wrangler.qa-pr100-v2.json --remote --json --command "$before" > "$TMP/before.json" 2>"$TMP/d1.err"
validate(){
 node --input-type=module - "$1" <<'NODE'
import {readFileSync} from "node:fs";
const x=JSON.parse(readFileSync(process.argv[2],"utf8"));
const a=Array.isArray(x)?x:[x],r=a.flatMap(v=>v.results||[])[0];
if(!r||Number(r.a_pub)!==1||Number(r.b_pub)!==0||
 Number(r.b_generic)!==1||Number(r.b_shadow)!==1||
 Number(r.b_receipts)!==2)throw Error("QA106_PARALLEL_SOURCE_BASELINE_CHANGED");
NODE
}
validate "$TMP/before.json"
launch(){
 local slot="$1" port token job log pid
 if [[ "$slot" == A ]];then port=8787;token="$QA106_PARALLEL_TOKEN_A"
 else port=8788;token="$QA106_PARALLEL_TOKEN_B";fi
 job="drive:${ROOT}_qa_${slot}"
 pid="$(qa106_spawn_worker_group "$TMP/worker-$slot.log" \
  npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
    --ip 127.0.0.1 --port "$port" \
    --var "INGESTION_TOKEN:$token" \
    --var "INGESTION_COORDINATOR_JOB_KEY:$job" \
    --var "INGESTION_COORDINATOR_ENABLED:true" \
    --var "INGESTION_GLOBAL_WRITE_GATE_ENABLED:true" \
    --var "INGESTION_IMMUTABLE_PUBLICATION_ENABLED:true" \
    --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:0" \
    --var "QA106_B_MAP_REVISION_SHADOW_ENABLED:false")"
 qa106_assert_worker_group "$pid"
 if [[ "$slot" == A ]];then PIDA="$pid";else PIDB="$pid";fi
 local code ready=0
 for attempt in $(seq 1 75);do
   code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
    -X POST -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' --data '{"action":"status"}' \
    "http://127.0.0.1:$port/api/drive-ingest-batch" 2>/dev/null || true)"
   if [[ "$code" == 200 ]];then ready=1;break;fi
   if ! kill -0 "$pid" 2>/dev/null;then break;fi
   sleep 2
 done
 if [[ "$ready" != 1 ]];then
   echo "::error::QA106_PARALLEL_QA_WORKER_NOT_READY";exit 1
 fi
}
launch A
launch B
node scripts/qa-issue106-real-parallel-lease-proof.mjs claim
qa106_stop_worker_group "$PIDA"
PIDA=""
node scripts/qa-issue106-real-parallel-lease-proof.mjs b-survives
# 30-second A lease deliberately expires; B is actively renewed for 60 sec.
sleep 34
launch A
node scripts/qa-issue106-real-parallel-lease-proof.mjs reclaim
node scripts/qa-issue106-real-parallel-lease-proof.mjs cleanup
npx wrangler d1 execute elevator-help-lease-test-01 --config wrangler.qa-pr100-v2.json --remote --json --command "$before" > "$TMP/after.json" 2>"$TMP/d1.err"
validate "$TMP/after.json"
node --input-type=module - "$TMP/before.json" "$TMP/after.json" <<'NODE'
import {readFileSync} from "node:fs";
const row=p=>{const x=JSON.parse(readFileSync(p,"utf8"));
 const a=Array.isArray(x)?x:[x];return a.flatMap(v=>v.results||[])[0];};
const a=row(process.argv[2]),b=row(process.argv[3]);
if(JSON.stringify(a)!==JSON.stringify(b))
 throw Error("QA106_PARALLEL_PUBLICATION_CHANGED");
NODE
echo "PASS:QA106_PARALLEL_A_B_PUBLICATION_AND_RECEIPTS_UNCHANGED"
echo "PASS:QA106_TWO_REAL_QA_WORKERS_NO_GEMINI_NO_VECTORIZE_WRITES"
