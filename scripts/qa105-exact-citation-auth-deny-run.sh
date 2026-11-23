#!/usr/bin/env bash
# One-shot QA105 fail-closed actual Cloudflare Worker HTTP exercise. Never models.
set -Eeuo pipefail
umask 077
[[ "${GITHUB_ACTIONS:-}" == true &&
   "${GITHUB_EVENT_NAME:-}" == push &&
   "${GITHUB_REF:-}" == refs/heads/feat/issue106-shadow-map-revision-20261122 &&
   "${QA105_NO_MODEL_CONFIRMATION:-}" == QA105_DISABLED_AUTH_GATE_HTTP_ONLY &&
   -z "${GEMINI_API_KEY:-}" &&
   -z "${GEMINI_BENCHMARK_API_KEY:-}" &&
   -z "${CLERK_SECRET_KEY:-}" ]] || {
 echo "::error::QA105_GUARD_DENIED";exit 1; }
for x in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID RUNNER_TEMP;do
  [[ -n "$(printenv "$x")" ]] || exit 1
done
test -s .open-next/worker.js
node --input-type=module <<'NODE'
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
if(c.d1_databases?.length!==1||
 c.d1_databases[0].database_id!=="02716877-15e3-4478-9e24-f1ba6e5dfb00"||
 c.vectorize?.length!==2||
 c.vectorize[0].index_name!=="elevator-help-staging-test"||
 c.vectorize[1].index_name!=="elevator-help-staging-test-v2"||
 c.vars?.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only"||
 c.vars?.AUTH_REQUIRED!=="false"||
 c.vars?.QA105_AUTH_CITATION_PROBE_ENABLED==="true")
 throw Error("QA105_BINDINGS_SCOPE_DENIED");
NODE
source scripts/qa-issue106-worker-process-group.sh
TMP="$(mktemp -d "$RUNNER_TEMP/qa105-auth-only.XXXXXXXX")"
pid=""
cleanup(){
 local rc="$?"
 qa106_stop_worker_group "$pid" || rc=1
 rm -rf "$TMP"
 exit "$rc"
}
trap cleanup EXIT
pid="$(qa106_spawn_worker_group "$TMP/worker.log" \
 npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
 --ip 127.0.0.1 --port 8795 \
 --var "AUTH_REQUIRED:false" \
 --var "QA105_AUTH_CITATION_PROBE_ENABLED:false" \
 --var "QA106_ISOLATED_BINDINGS:qa106-pr100-v2-only" \
 --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:0")"
qa106_assert_worker_group "$pid"
for i in $(seq 1 75);do
 code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
   -X POST -H 'Content-Type: application/json' \
   --data '{"language":"de"}' \
   http://127.0.0.1:8795/api/qa105-exact-citation-probe 2>/dev/null||true)"
 if [[ "$code" == 503 ]];then break;fi
 if ! kill -0 "$pid" 2>/dev/null;then break;fi
 sleep 2
done
[[ "$code" == 503 ]] || {
 echo "::error::QA105_AUTH_PROBE_FAIL_OPEN";exit 1; }
node --input-type=module <<'NODE'
const url="http://127.0.0.1:8795/api/qa105-exact-citation-probe";
for(const language of ["de","it"]){
 for(const auth of [undefined,"Bearer forged.qa.jwt"]){
  const res=await fetch(url,{method:"POST",headers:{
   "Content-Type":"application/json",
   ...(auth?{Authorization:auth}:{})},
   body:JSON.stringify({language}),
   signal:AbortSignal.timeout(20000)});
  const payload=await res.json();
  if(res.status!==503||payload?.code!=="QA105_PROBE_DISABLED"||
     payload?.ok!==false||payload?.answer!==undefined||
     payload?.sourceText!==undefined)
    throw Error("QA105_PROBE_FAIL_OPEN");
 }
}
console.log("PASS:QA105_REAL_QA_HTTP_UNSIGNED_AND_FORGED_DENIED");
console.log("PASS:QA105_QA_WORKER_DEFAULT_OFF_NO_MODEL_NO_SOURCE_LEAK");
NODE
