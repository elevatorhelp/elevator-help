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
pid2=""
cleanup(){
 local rc="$?"
 qa106_stop_worker_group "$pid" || rc=1
 if [[ -n "$pid2" ]];then qa106_stop_worker_group "$pid2" || rc=1;fi
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
# Positive isolation check: /api/ask on QA MUST NEVER silently proxy
# to elevator.help Production when there is no Gemini key in QA.
node --input-type=module <<'NODE'
for(const question of [
  "Was bedeutet QA-4711 im Abschnitt QA-1.2.3?",
  "Cosa indica MOCK-DOOR-12 nella sezione QA-2.4.6?",
]){
 const res=await fetch("http://127.0.0.1:8795/api/ask",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({question}),signal:AbortSignal.timeout(20000)});
 const data=await res.json().catch(()=>null);
 if(res.status!==503||data?.diagnosticCode!=="QA106_ISOLATED_NO_MODEL"||
  typeof data?.answer==="string"||data?.sources!==undefined)
  throw Error("QA105_QA_ASK_FORWARDED_OR_NOT_DENIED");
}
console.log("PASS:QA106_REAL_QA_ASK_NO_MODEL_NEVER_PROXIES_PRODUCTION");
NODE

# SECOND isolated QA worker: opt-in gate ON, strict Clerk ON, but only a
# deliberately INVALID, non-secret Clerk key. No genuine tokens or user data.
# Verifies an unsigned or forged bearer is denied by auth, not by default-off.
pid2="$(qa106_spawn_worker_group "$TMP/worker-auth-on.log" \
 npx wrangler dev --remote --config wrangler.qa-pr100-v2.json \
 --ip 127.0.0.1 --port 8796 \
 --var "AUTH_REQUIRED:true" \
 --var "QA105_AUTH_CITATION_PROBE_ENABLED:true" \
 --var "QA105_EXPECTED_CLERK_TEST_USER_ID:user_QA105OFFLINE0001" \
 --var "CLERK_SECRET_KEY:sk_test_dummy_not_a_real_clerk_key" \
 --var "INGESTION_PUBLISHED_READS_ENABLED:true" \
 --var "INGESTION_MAP_REVISION_READS_ENABLED:true" \
 --var "QA106_ISOLATED_BINDINGS:qa106-pr100-v2-only" \
 --var "GEMINI_MAX_CALLS_PER_INGEST_REQUEST:0")"
qa106_assert_worker_group "$pid2"
for i in $(seq 1 75);do
 code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 \
   -X POST -H 'Content-Type: application/json' \
   --data '{"language":"de"}' \
   http://127.0.0.1:8796/api/qa105-exact-citation-probe 2>/dev/null||true)"
 if [[ "$code" == 401 ]];then break;fi
 if ! kill -0 "$pid2" 2>/dev/null;then break;fi
 sleep 2
done
[[ "$code" == 401 ]] || {
 echo "::error::QA105_REAL_AUTH_GATE_DID_NOT_REQUIRE_JWT";exit 1; }
node --input-type=module <<'NODE'
const url="http://127.0.0.1:8796/api/qa105-exact-citation-probe";
for(const language of ["de","it"]){
 for(const auth of [undefined,"Bearer definitely.invalid.signature"]){
  const res=await fetch(url,{method:"POST",headers:{
   "Content-Type":"application/json",
   ...(auth?{Authorization:auth}:{})},
   body:JSON.stringify({language}),
   signal:AbortSignal.timeout(20000)});
  const result=await res.json();
  if(res.status!==401||result?.code!=="QA105_AUTH_DENIED"||
     result?.ok!==false||result?.sourceAttested!==undefined)
    throw Error("QA105_AUTHENTICATED_MODE_FAIL_OPEN");
 }
}
console.log("PASS:QA105_QA_REAL_HTTP_AUTH_ON_UNSIGNED_AND_FORGED_401");
console.log("PASS:QA105_QA_REAL_HTTP_NO_GEMINI_NO_SOURCE_DISCLOSURE");
NODE
