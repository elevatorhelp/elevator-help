import assert from 'node:assert/strict';
import {hasPhysicalPdfPageCitation,hasEn8120ReleaseCitationContract} from './qa-physical-pdf-page.mjs';

// Run only with a legitimate owner-authorized Clerk session; never print tokens or answer bodies.
const base=process.env.QA_ASK_BASE_URL;
const token=process.env.QA_CLERK_SESSION_JWT;
const question=process.env.QA_ASK_QUESTION;
const expected=process.env.QA_EXPECTED_CITATION;
if(!base||!token||!question||!expected)throw Error('SIGNED_IN_ASK_QA_CONFIG_REQUIRED');
assert.ok(hasEn8120ReleaseCitationContract(expected),'Expected citation must include EN 81-20 edition, clause and physical PDF page in one literal snippet');
const origin=new URL(base);
assert.equal(origin.protocol,'https:');
assert.ok(!origin.username&&!origin.password&&!origin.search&&!origin.hash);
// A real Clerk bearer must never be forwarded to an arbitrary URL from QA env.
// This production release gate is intentionally pinned to the owner's origin.
assert.equal(origin.origin,'https://elevator.help','Signed Clerk release QA must target the approved production origin');
const endpoint=new URL('/api/ask',origin);
const headers={'content-type':'application/json'};
async function ask(authorization){
  const h={...headers};
  if(authorization)h.authorization='Bearer '+authorization;
  const r=await fetch(endpoint,{method:'POST',headers:h,body:JSON.stringify({question}),redirect:'manual',signal:AbortSignal.timeout(45000)});
  let body;
  try{body=await r.json()}catch{body=null}
  return {status:r.status,body};
}
const denied=await ask(null);
assert.equal(denied.status,401,'Missing session must be rejected before paid processing');
const invalid=await ask('invalid.qa.session');
assert.equal(invalid.status,401,'Invalid session must be rejected');
const accepted=await ask(token);
assert.equal(accepted.status,200,'Valid signed Clerk user must receive an answer');
assert.equal(typeof accepted.body?.answer,'string');
assert.ok(accepted.body.answer.trim().length>30);
assert.equal(accepted.body.mode,'standards_verified','Only verified standards evidence can satisfy this EN 81-20 citation release gate');
assert.ok(hasPhysicalPdfPageCitation(accepted.body.answer),'Verified answer must label a positive physical PDF page, not a printed standard page');
assert.ok(accepted.body.answer.toLowerCase().includes(expected.toLowerCase()),'Required edition/clause/physical-page citation must occur together in the customer answer, not only in metadata');
console.log('PASS: Clerk-signed /api/ask answer includes expected physical PDF citation, missing and invalid sessions denied');
