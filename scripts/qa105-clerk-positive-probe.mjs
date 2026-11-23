/**
 * Issue #105 dedicated test-only Clerk positive HTTP probe.
 * Manual-only QA workflow, absolutely NO Gemini or Workers AI.
 * Never prints or persists token, source body, Clerk claims or secrets.
 */
import {readFileSync,writeFileSync,chmodSync} from "node:fs";
import {randomBytes} from "node:crypto";

const denied=code=>{throw Error("QA105_POSITIVE_"+code);};
const mode=process.argv[2];
const expectedOrigin="http://127.0.0.1:8797";
const secret=process.env.QA105_CLERK_TEST_SECRET_KEY;
const token=process.env.QA105_CLERK_TEST_SESSION_JWT;
const identity=process.env.QA105_CLERK_TEST_USER_ID;
function guard(){
 if(process.env.GITHUB_ACTIONS!=="true"||
    process.env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
    process.env.GITHUB_REF!=="refs/heads/feat/issue106-shadow-map-revision-20261122"||
    process.env.QA105_POSITIVE_CONFIRMATION!=="QA105_REAL_TEST_CLERK_ZERO_MODEL"||
    process.env.GEMINI_API_KEY!==undefined||
    process.env.GEMINI_BENCHMARK_API_KEY!==undefined||
    process.env.CLERK_SECRET_KEY!==undefined||
    !["preflight","prepare-vars","probe"].includes(mode)||
    !/^[1-9][0-9]{5,19}$/.test(process.env.GITHUB_RUN_ID||""))
   denied("CONTEXT_DENIED");
 const config=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
 if(config.d1_databases?.length!==1||
    config.d1_databases[0].database_id!=="02716877-15e3-4478-9e24-f1ba6e5dfb00"||
    config.d1_databases[0].database_name!=="elevator-help-lease-test-01"||
    config.vectorize?.length!==2||
    config.vectorize[0].index_name!=="elevator-help-staging-test"||
    config.vectorize[1].index_name!=="elevator-help-staging-test-v2"||
    config.vars?.AUTH_REQUIRED!=="false"||
    config.vars?.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only")
   denied("NON_QA_BINDINGS");
 if(typeof secret!=="string"||!/^sk_test_[A-Za-z0-9]{12,}$/.test(secret)||
    typeof token!=="string"||token.split(".").length!==3||
    token.length<90||token.length>10000||
    !/^user_[A-Za-z0-9]{8,100}$/.test(identity||""))
   denied("REVIEWED_CLERK_TEST_SECRETS_MISSING");
 // Only a TEST Clerk secret and explicitly matching account; do not
 // parse/trust unverified JWT claims here. The real Clerk verifier decides.
 const dirname=process.env.RUNNER_TEMP||"";
 const path=process.env.QA105_PRIVATE_DEV_VARS||"";
 if(!dirname||!path.startsWith(dirname+"/")||!path.endsWith("/.dev.vars"))
   denied("PRIVATE_PATH_DENIED");
}
async function probe(){
 const endpoint=expectedOrigin+"/api/qa105-exact-citation-probe";
 const tests=[
  ["de","QA-4711","QA-1.2.3",1],
  ["it","MOCK-DOOR-12","QA-2.4.6",2],
 ];
 // All tests go through real Clerk verifyToken and real remote QA
 // D1 + both Vectorize bindings; no model request anywhere in route.
 const post=async (language,authorization)=>{
  let response;
  try{response=await fetch(endpoint,{
   method:"POST",
   headers:{"Content-Type":"application/json",
    ...(authorization?{"Authorization":"Bearer "+authorization}:{})},
   body:JSON.stringify({language}),
   signal:AbortSignal.timeout(30000),
  });}catch{denied("QA_WORKER_UNREACHABLE")}
  const body=await response.json().catch(()=>null);
  if(!body||typeof body!=="object")denied("QA_WORKER_BAD_RESPONSE");
  return {code:response.status,data:body};
 };
 for(const [lang,code,section,page] of tests){
  const unsigned=await post(lang);
  const forged=await post(lang,"not.a.valid.clerk.signature");
  if(unsigned.code!==401||forged.code!==401||
     unsigned.data.code!=="QA105_AUTH_DENIED"||
     forged.data.code!=="QA105_AUTH_DENIED")
   denied("AUTH_NEGATIVE_GATE_FAILED");
  const valid=await post(lang,token);
  if(valid.code!==200||valid.data.ok!==true||
     valid.data.qaOnly!==true||valid.data.modelCalls!==0||
     valid.data.language!==lang||
     valid.data.referenceCode!==code||
     valid.data.section!==section||
     valid.data.page!==page||
     valid.data.sourceAttested!==true)
   denied("REAL_CLERK_OR_QA_EVIDENCE_NOT_ATTESTED");
 }
 console.log("PASS:QA105_REAL_TEST_CLERK_AUTH_AND_QA_DUAL_INDEX_CITATIONS");
 console.log("PASS:QA105_DE_IT_EXACT_SECTION_PAGE_NO_MODEL_NO_SOURCE_TEXT");
}
async function main(){
 guard();
 if(mode==="preflight"){
  console.log("PASS:QA105_TEST_ONLY_CLERK_ENV_CHECKED_NO_SECRETS_EXPOSED");
  return;
 }
 if(mode==="prepare-vars"){
  // Wrangler dev loads .dev.vars from checkout; never pass auth secret
  // on the command line or commit it to git. Restrict file permissions.
  const vars={
   CLERK_SECRET_KEY:secret,
   AUTH_REQUIRED:"true",
   QA105_AUTH_CITATION_PROBE_ENABLED:"true",
   QA105_EXPECTED_CLERK_TEST_USER_ID:identity,
   QA106_ISOLATED_BINDINGS:"qa106-pr100-v2-only",
   INGESTION_PUBLISHED_READS_ENABLED:"true",
   INGESTION_MAP_REVISION_READS_ENABLED:"true",
   GEMINI_MAX_CALLS_PER_INGEST_REQUEST:"0",
  };
  const path=process.env.QA105_PRIVATE_DEV_VARS;
  writeFileSync(path,Object.entries(vars).map(([k,v])=>
   k+"="+JSON.stringify(v)).join("\n")+"\n",{mode:0o600,flag:"wx"});
  chmodSync(path,0o600);
  console.log("PASS:QA105_PRIVATE_TEST_ONLY_ENV_PREPARED");
  return;
 }
 await probe();
}
main().catch(e=>{
 const code=String(e?.message||"");
 console.error("::error::"+(
   /^QA105_POSITIVE_[A-Z0-9_]{3,90}$/.test(code)?code:
    "QA105_POSITIVE_SAFE_ABORT"));
 process.exitCode=1;
});
