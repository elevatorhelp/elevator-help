/**
 * Issue #105 dedicated test-only Clerk positive HTTP probe.
 * Manual-only QA workflow, absolutely NO Gemini or Workers AI.
 * Never prints or persists token, source body, Clerk claims or secrets.
 */
import {readFileSync,writeFileSync,chmodSync} from "node:fs";
import {verifyToken} from "@clerk/backend";

const denied=code=>{throw Error("QA105_POSITIVE_"+code);};
const mode=process.argv[2];
const expectedOrigin="http://127.0.0.1:8797";
const secret=process.env.QA105_CLERK_TEST_SECRET_KEY;
const identity=process.env.QA105_CLERK_TEST_USER_ID;
function guard(){
 const event=process.env.GITHUB_EVENT_NAME;
 const permittedTrigger=event==="workflow_dispatch"||
   (event==="push"&&
    process.env.QA105_POSITIVE_EVENT_TRIGGER===
    "qa105(test): authorized real Clerk TEST positive probe zero models");
 if(process.env.GITHUB_ACTIONS!=="true"||
    !permittedTrigger||
    process.env.GITHUB_REF!=="refs/heads/feat/issue106-shadow-map-revision-20261122"||
    process.env.QA105_POSITIVE_CONFIRMATION!=="QA105_REAL_TEST_CLERK_ZERO_MODEL"||
    process.env.GEMINI_API_KEY!==undefined||
    process.env.GEMINI_BENCHMARK_API_KEY!==undefined||
    process.env.CLERK_SECRET_KEY!==undefined||
    process.env.QA105_CLERK_TEST_SESSION_JWT!==undefined||
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
 if(typeof secret!=="string"||!/^sk_test_[A-Za-z0-9_-]{12,}$/.test(secret)||
    !/^user_[A-Za-z0-9]{8,100}$/.test(identity||""))
   denied("REVIEWED_CLERK_TEST_SECRETS_MISSING");
 // Only a TEST Clerk secret and explicitly matching account; do not
 // parse/trust unverified JWT claims here. The real Clerk verifier decides.
 const dirname=process.env.RUNNER_TEMP||"";
 const path=process.env.QA105_PRIVATE_DEV_VARS||"";
 if(!dirname||!path.startsWith(dirname+"/")||!path.endsWith("/.dev.vars"))
   denied("PRIVATE_PATH_DENIED");
}
// Clerk's officially documented TEST-only Backend API path. A JWT is
// minted immediately before each HTTP probe, never stored as a GitHub secret.
const base="https://api.clerk.com/v1";
async function bapi(path,body={}){
 let response;
 try{response=await fetch(base+path,{
  method:"POST",
  headers:{Authorization:"Bearer "+secret,
   "Content-Type":"application/json",Accept:"application/json"},
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(20000),
 });}catch{denied("CLERK_TEST_TRANSPORT_FAILED");}
 if(!response.ok)denied("CLERK_TEST_API_REJECTED");
 const data=await response.json().catch(()=>null);
 if(!data||typeof data!=="object")denied("CLERK_TEST_BAD_RESPONSE");
 return data;
}
async function startTestSession(){
 const session=await bapi("/sessions",{user_id:identity});
 if(!/^sess_[A-Za-z0-9]{8,}$/.test(session.id||"")||
    session.user_id!==identity||session.status!=="active")
  denied("CLERK_TEST_SESSION_NOT_ACTIVE");
 return session.id;
}
async function freshToken(sessionId){
 const result=await bapi("/sessions/"+sessionId+"/tokens",{});
 const jwt=result.jwt;
 if(typeof jwt!=="string"||jwt.split(".").length!==3||
    jwt.length<90||jwt.length>10000)
  denied("CLERK_TEST_SESSION_JWT_INVALID");
 return jwt;
}
async function locallyVerifyToken(jwt){
 // Check exactly the same signed JWT verifier as app/lib/request-auth.ts.
 // On any failure only a fixed enum is printed, never the token, claims or
 // arbitrary Clerk error messages.
 const verify=async options=>{
  try{return await verifyToken(jwt,options);}
  catch{return null;}
 };
 const usable=result=>{
  if(!result||typeof result!=="object"||
     result.errors!==undefined&&result.errors!==null)return false;
  const c="data" in result?result.data:result;
  return c?.sub===identity&&typeof c?.sid==="string"&&
    c.sid.startsWith("sess_");
 };
 const strict=await verify({secretKey:secret,authorizedParties:[expectedOrigin]});
 if(usable(strict)){console.log("PASS:QA105_LOCAL_CLERK_TEST_JWT_STRICTLY_VERIFIED");return;}
 const basic=await verify({secretKey:secret});
 if(usable(basic))denied("TEST_SESSION_AUTHORIZED_PARTY_MISMATCH");
 denied("TEST_SESSION_SIGNATURE_OR_CLAIMS_NOT_VERIFIED");
}
async function revokeSession(sessionId){
 try{await bapi("/sessions/"+sessionId+"/revoke");}
 catch{console.error("::warning::QA105_TEST_SESSION_REVOKE_UNCONFIRMED");}
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
 const sessionId=await startTestSession();
 try{
 for(const [lang,code,section,page] of tests){
  const unsigned=await post(lang);
  const forged=await post(lang,"not.a.valid.clerk.signature");
  if(unsigned.code!==401||forged.code!==401||
     unsigned.data.code!=="QA105_AUTH_DENIED"||
     forged.data.code!=="QA105_AUTH_DENIED")
   denied("AUTH_NEGATIVE_GATE_FAILED");
  const jwt=await freshToken(sessionId);
  await locallyVerifyToken(jwt);
  const valid=await post(lang,jwt);
  // Never output HTTP body, token, user ID or the Evidence text.
  // Only known aggregate enums are permitted in CI diagnostic logs.
  if(valid.code===401)denied("SIGNED_TEST_TOKEN_REJECTED_401");
  if(valid.code===403)denied("DEDICATED_TEST_USER_REJECTED_403");
  if(valid.code===409)denied("QA_EXACT_CITATION_NOT_ATTESTED_409");
  if(valid.code===503)denied("QA_PROBE_BINDINGS_UNAVAILABLE_503");
  if(valid.code!==200||valid.data.ok!==true||
     valid.data.qaOnly!==true||valid.data.modelCalls!==0||
     valid.data.language!==lang||
     valid.data.referenceCode!==code||
     valid.data.section!==section||
     valid.data.page!==page||
     valid.data.sourceAttested!==true)
   denied("REAL_CLERK_OR_QA_EVIDENCE_NOT_ATTESTED");
 }
 }finally{await revokeSession(sessionId);}
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
