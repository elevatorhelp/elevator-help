import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {registerHooks} from "node:module";
import {
 QA_CLERK_ORIGIN,requireQaClerkOrigin,validateQaClerkConfig,
 validateRepositoryQaClerkConfig
} from "./qa-pr63-clerk-config-guard.mjs";
import {validateQaSessionJwt,verifyRealQaClerkAuth} from "./qa-pr63-clerk-auth-probe.mjs";

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
 {...env,CLERK_SECRET_KEY:""},{...env,GEMINI_API_KEY:"some-secret"},
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
assert.ok(wf.includes("QA_CLERK_SESSION_JWT: ${{ secrets.QA_CLERK_SESSION_JWT }}"));
assert.ok(wf.includes("npx wrangler deploy --config wrangler.qa-clerk.json"));
assert.ok(!wf.includes("https://elevator.help/api/ask"));
console.log("PASS: isolated Clerk Worker denies full questions, wrong env, prod-origin token and paid archive bindings");
