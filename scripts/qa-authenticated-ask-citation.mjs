import assert from "node:assert/strict";

// Run in an authorized test environment. Never print tokens or answer bodies.
const base=process.env.QA_ASK_BASE_URL;
const token=process.env.QA_CLERK_SESSION_JWT;
const question=process.env.QA_ASK_QUESTION;
const expected=process.env.QA_EXPECTED_CITATION;
if(!base||!token||!question||!expected)throw Error("SIGNED_IN_ASK_QA_CONFIG_REQUIRED");
const origin=new URL(base);
assert.equal(origin.protocol,"https:");
assert.ok(!origin.username&&!origin.password&&!origin.search&&!origin.hash);
const endpoint=new URL("/api/ask",origin);
const headers={"content-type":"application/json"};
async function ask(authorization){
 const h={...headers};
 if(authorization)h.authorization="Bearer "+authorization;
 const r=await fetch(endpoint,{method:"POST",headers:h,body:JSON.stringify({question}),redirect:"manual",signal:AbortSignal.timeout(45000)});
 let body;
 try{body=await r.json()}catch{body=null}
 return {status:r.status,body};
}
const denied=await ask(null);
assert.equal(denied.status,401,"Missing session must be rejected before paid processing");
const invalid=await ask("invalid.qa.session");
assert.equal(invalid.status,401,"Invalid session must be rejected");
const accepted=await ask(token);
assert.equal(accepted.status,200,"Valid signed Clerk user must receive an answer");
assert.equal(typeof accepted.body?.answer,"string");
assert.ok(accepted.body.answer.trim().length>30);
assert.ok(!["gemini_direct","gemini_direct_unverified","gemini_web","clarification"].includes(accepted.body.mode),"Unverified response is not cited archive evidence");
const cited=JSON.stringify({answer:accepted.body.answer,sources:accepted.body.sources||[],standardsChecked:accepted.body.standardsChecked||[]});
assert.ok(cited.toLowerCase().includes(expected.toLowerCase()),"Required actual source/page citation not present");
console.log("PASS: Clerk-signed /api/ask answer includes expected verified citation, missing and invalid sessions denied");
