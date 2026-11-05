import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {registerHooks} from "node:module";
import {
 QA_CLERK_ORIGIN,requireQaClerkOrigin,validateQaClerkConfig,
 validateRepositoryQaClerkConfig
} from "./qa-pr63-clerk-config-guard.mjs";
import {validateQaSessionJwt,verifyRealQaClerkAuth} from "./qa-pr63-clerk-auth-probe.mjs";
import {runFreshQaClerkSession,validateQaClerkIdentity,safeQaClerkStageError} from "./qa-pr63-clerk-fresh-session.mjs";
import {validateClerkTestUser} from "./qa-pr63-clerk-user-preflight.mjs";

// Stub only the compiled OpenNext import, not the QA fetch wrapper.
const hooks=registerHooks({
 resolve(specifier,context,nextResolve){
  if(specifier==="../.open-next/worker.js")
   return {url:"data:text/javascript,export default {fetch:async()=>new Response(null,{status:400})};",shortCircuit:true};
  return nextResolve(specifier,context);
 },
});
let clerkQaFetch;
try{({clerkQaFetch}=await import("../workers/qa-clerk-entry.mjs"));}
finally{hooks.deregister();}
validateRepositoryQaClerkConfig();
assert.equal(requireQaClerkOrigin(QA_CLERK_ORIGIN).origin,QA_CLERK_ORIGIN);
for(const invalid of [
 "https://elevator.help","https://elevator-help-pr63-clerk-qa.baharmand.workers.dev.evil.example",
 "http://elevator-help-pr63-clerk-qa.baharmand.workers.dev",
 QA_CLERK_ORIGIN+"/api/ask",QA_CLERK_ORIGIN+"?token=secret",
 "https://user:pass@elevator-help-pr63-clerk-qa.baharmand.workers.dev",
])assert.throws(()=>requireQaClerkOrigin(invalid),/QA_CLERK_ORIGIN_NOT_APPROVED/);
const config=JSON.parse(readFileSync(new URL("../wrangler.qa-clerk.json",import.meta.url),"utf8"));
for(const property of ["d1_databases","vectorize","ai","ratelimits","kv_namespaces","r2_buckets"])
 assert.ok(!(property in config),"Clerk test cannot bind "+property);
for(const bad of [
 {...config,name:"elevator-help-pr61-app-qa"},
 {...config,vars:{...config.vars,AUTH_REQUIRED:"false"}},
 {...config,d1_databases:[]},{...config,ai:{binding:"AI"}},
 {...config,vars:{...config.vars,GEMINI_API_KEY:"bogus"}},
])assert.throws(()=>validateQaClerkConfig(bad));
let called=0;
const handler={async fetch(){called++;return new Response(null,{status:400});}};
const env={AUTH_REQUIRED:"true",QA_CLERK_AUTH_ONLY:"true",CLERK_SECRET_KEY:"sk_test_local_synthetic"};
const request=(path,body,headers={})=>new Request(QA_CLERK_ORIGIN+path,{
 method:"POST",headers:{"content-type":"application/json",...headers},
 body:typeof body==="string"?body:JSON.stringify(body)
});
const submit=async(body,override=env)=>clerkQaFetch(request("/api/ask",body),override,{},handler);
assert.equal((await submit({question:""})).status,400);
assert.equal(called,1,"only empty question may reach the app");
for(const bad of [
 {question:"hello"},{question:" "},{question:"",history:[]},
 {question:"",model:"x"},[],"not json","{bad}",
]){
 const result=await submit(bad);
 assert.ok([400,403].includes(result.status),"reject unexpected/nonempty");
}
assert.equal(called,1);
for(const bad of [
 {...env,AUTH_REQUIRED:"false"},{...env,QA_CLERK_AUTH_ONLY:"false"},
 {...env,CLERK_SECRET_KEY:""},{...env,CLERK_SECRET_KEY:"sk_live_NOT_FOR_QA"},
 {...env,GEMINI_API_KEY:"some-secret"},
 {...env,CORTEX_DB:{}},{...env,VECTORIZE:{}},{...env,VECTORIZE_V2:{}},{...env,AI:{}},
])assert.equal((await submit({question:""},bad)).status,503);
assert.equal(called,1,"wrong env never reaches real app");
assert.equal((await clerkQaFetch(new Request(QA_CLERK_ORIGIN+"/api/health"),env,{},handler)).status,404);
assert.equal((await clerkQaFetch(new Request(QA_CLERK_ORIGIN+"/api/ask"),env,{},handler)).status,404);
assert.equal((await submit({question:"",junk:"x".repeat(300)})).status,413);
assert.equal(called,1);
const jwt="a".repeat(55)+"."+"b".repeat(45)+"."+"c".repeat(44);
assert.equal(validateQaSessionJwt(jwt),jwt);
for(const invalid of ["",undefined,"sk_test_secret","invalid.qa.session","a.b.c"])
 assert.throws(()=>validateQaSessionJwt(invalid),/QA_CLERK_VALID_SESSION_REQUIRED/);
const calls=[];
const fakeFetch=async(url,opts)=>{
 assert.equal(String(url),QA_CLERK_ORIGIN+"/api/ask");
 assert.equal(opts.redirect,"error");
 const body=JSON.parse(opts.body);
 calls.push({auth:opts.headers.authorization,question:body.question});
 return {status:[401,401,400,403][calls.length-1]};
};
assert.equal(await verifyRealQaClerkAuth({token:jwt,fetchImpl:fakeFetch}),
 "QA_CLERK_REAL_AUTH_ONLY_VERIFIED");
assert.equal(calls.length,4);
assert.deepEqual(calls.map(x=>x.question),["","","","Do not answer this QA question."]);
assert.deepEqual(calls.map(x=>x.auth),[undefined,"Bearer invalid.qa.session","Bearer "+jwt,"Bearer "+jwt]);
await assert.rejects(verifyRealQaClerkAuth({origin:"https://elevator.help",token:jwt,fetchImpl:fakeFetch}),
 /QA_CLERK_ORIGIN_NOT_APPROVED/);
assert.equal(calls.length,4,"never leak bearer to Production");
const wf=readFileSync(new URL("../.github/workflows/qa-pr63-clerk-auth.yml",import.meta.url),"utf8");
const parent=readFileSync(new URL("../.github/workflows/qa-pr61-actual-app.yml",import.meta.url),"utf8");
const header=wf.split(/^permissions:/m)[0];
assert.ok(header.includes("  workflow_call:"));
assert.ok(!/^  (push|pull_request|schedule|workflow_run|repository_dispatch):/m.test(header));
assert.match(parent,/run_clerk_auth_qa:[\s\S]*?default: false/);
assert.match(parent,/inputs\.run_clerk_auth_qa == true/);
assert.match(parent,/inputs\.run_clerk_auth_qa == false/g);
for(const forbidden of [
 "inputs.allow_paid_gemini == true","inputs.allow_isolated_d1_mutation == true",
 "npx wrangler d1 execute","GEMINI_BENCHMARK_API_KEY","GOOGLE_SERVICE_ACCOUNT_JSON",
])assert.ok(!wf.includes(forbidden),"Clerk Worker cannot invoke paid QA/D1/Drive");
assert.ok(wf.includes("sk_test_"),"only Clerk test-instance credentials");
assert.ok(wf.includes("--secrets-file"),"secure Clerk secret injection");
assert.ok(wf.includes("CLERK_QA_TEST_USER_ID: ${{ secrets.CLERK_QA_TEST_USER_ID }}"));
assert.ok(wf.includes("scripts/qa-pr63-clerk-fresh-session.mjs"));
const sessionStep=wf.split("      - name: Mint and revoke one fresh Clerk TEST session then verify real auth")[1];
assert.ok(sessionStep,"must retain dedicated final short-lived Clerk session step");
assert.match(sessionStep,/^        env:\s*$/m,"fresh session must receive explicitly scoped environment");
assert.ok(sessionStep.includes("CLERK_QA_SECRET_KEY: ${{ secrets.CLERK_QA_SECRET_KEY }}"),
 "Run #40 regression: session step must explicitly receive test Clerk secret, not rely on previous step-scoped env");
assert.ok(sessionStep.includes("CLERK_QA_TEST_USER_ID: ${{ secrets.CLERK_QA_TEST_USER_ID }}"));
assert.ok(sessionStep.includes("run: node scripts/qa-pr63-clerk-fresh-session.mjs"));
assert.ok(!sessionStep.includes("sk_live_"),"live Clerk key is never authorized for QA");

assert.ok(!wf.includes("QA_CLERK_SESSION_JWT"),"short-lived Clerk JWT must never be a stored GitHub secret");
assert.ok(wf.includes("npx wrangler deploy --config wrangler.qa-clerk.json"));
assert.ok(!wf.includes("https://elevator.help/api/ask"));

assert.equal(safeQaClerkStageError("CREATE_SESSION",{status:422,message:"sensitive-username"}).message,
 "QA_CLERK_CREATE_SESSION_HTTP_422");
assert.equal(safeQaClerkStageError("GET_TOKEN",{status:503,message:"bearer leak"}).message,
 "QA_CLERK_GET_TOKEN_HTTP_503");
assert.equal(safeQaClerkStageError("VERIFY_TOKEN",{status:200,message:"secret"}).message,
 "QA_CLERK_VERIFY_TOKEN_FAILED");
assert.throws(()=>safeQaClerkStageError("EVIL",{status:400}),/QA_CLERK_INVALID_STAGE/);

const userLookupAt=wf.indexOf("run: node scripts/qa-pr63-clerk-user-preflight.mjs");
const cloudflareBuildAt=wf.indexOf("run: npm run cf:build");
const cloudflareDeployAt=wf.indexOf("npx wrangler deploy --config wrangler.qa-clerk.json");
assert.ok(userLookupAt>0&&cloudflareBuildAt>userLookupAt&&cloudflareDeployAt>cloudflareBuildAt,
 "read-only Clerk test-user preflight must precede every new Worker deployment");
const userStep=wf.split("      - name: Confirm Clerk test user belongs to selected test instance (read-only)")[1]
 ?.split("      - name: Test no-paid Clerk boundary offline")[0];
assert.ok(userStep&&userStep.includes("CLERK_QA_SECRET_KEY:")&&userStep.includes("CLERK_QA_TEST_USER_ID:"),
 "test-user preflight must explicitly receive both test-only secrets");

const userId="user_ABC12345678";
const testSecret="sk_test_synthetic";
assert.deepEqual(validateQaClerkIdentity(testSecret,userId),{secretKey:testSecret,userId});
assert.throws(()=>validateQaClerkIdentity("sk_live_forbidden",userId),/QA_CLERK_TEST_INSTANCE_SECRET_REQUIRED/);
assert.throws(()=>validateQaClerkIdentity(testSecret,"production-user"),/QA_CLERK_TEST_USER_REQUIRED/);
async function mockSession({failProbe=false,failRevoke=false,wrongClaims=false,failCreate=false,failMint=false,failVerify=false}={}){
 const events=[];
 const client={sessions:{
   async createSession({userId:actual}){assert.equal(actual,userId);events.push("create");
    if(failCreate)throw Object.assign(new Error("token-and-user-private"),{status:422});
    return {id:"sess_ABC12345678",userId};},
   async getToken(session){assert.equal(session,"sess_ABC12345678");events.push("mint");
    if(failMint)throw Object.assign(new Error("token-and-user-private"),{status:503});
    return {jwt};},
   async revokeSession(session){assert.equal(session,"sess_ABC12345678");events.push("revoke");
     if(failRevoke)throw Error("sensitive revoke failure");return {id:session};},
 }};
 const call=runFreshQaClerkSession({
   secretKey:testSecret,userId,createClient:({secretKey})=>{
     assert.equal(secretKey,testSecret);return client;},
   verify:async(token,opts)=>{
     assert.equal(token,jwt);assert.deepEqual(opts,{secretKey:testSecret,authorizedParties:[QA_CLERK_ORIGIN]});
     events.push("verify");
     return failVerify?{errors:[{message:"secret-verifier-internal"}]}:
       {data:{sub:userId,sid:wrongClaims?"sess_other":"sess_ABC12345678"}};},
   probe:async({origin,token})=>{
     assert.equal(origin,QA_CLERK_ORIGIN);assert.equal(token,jwt);events.push("probe");
     if(failProbe)throw Error("sensitive actual Clerk response");
     return "QA_CLERK_REAL_AUTH_ONLY_VERIFIED";
   },
 });
 return {call,events};
}
{
 const {call,events}=await mockSession();
 assert.equal(await call,"QA_CLERK_FRESH_TEST_SESSION_VERIFIED_AND_REVOKED");
 assert.deepEqual(events,["create","mint","verify","probe","revoke"]);
}
for(const setting of [
 {failProbe:true,expected:"QA_CLERK_AUTH_PROBE_FAILED"},
 {wrongClaims:true,expected:"QA_CLERK_SESSION_CLAIMS_MISMATCH"},
 {failRevoke:true,expected:"QA_CLERK_OWNED_SESSION_REVOKE_FAILED"},
 {failCreate:true,expected:"QA_CLERK_CREATE_SESSION_HTTP_422"},
 {failMint:true,expected:"QA_CLERK_GET_TOKEN_HTTP_503"},
 {failVerify:true,expected:"QA_CLERK_VERIFY_TOKEN_REJECTED"}
]){
 const {call,events}=await mockSession(setting);
 await assert.rejects(call,new RegExp(setting.expected));
 if(setting.failCreate)
   assert.equal(events.includes("revoke"),false,
    "cannot revoke a session whose creation failed without yielding an ID");
 else assert.ok(events.includes("revoke"),
   "an owned Clerk session must be revoked after ANY subsequent failure");
}
await assert.rejects(runFreshQaClerkSession({
 secretKey:testSecret,userId,origin:"https://elevator.help",
 createClient:()=>{throw Error("must reject before client instantiated");},
}),/QA_CLERK_ORIGIN_NOT_APPROVED/);

console.log("PASS: isolated Clerk Worker denies full questions, wrong env, prod-origin token and paid archive bindings");
