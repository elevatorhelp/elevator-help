import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Network-denied synthetic fixture: validates the release QA gate, NOT Clerk itself.
const expected='DIN EN 81-20:2014-11 §5.4.7.4, PDF-Seite 79';
const preload=`
globalThis.fetch=async (_url,{headers})=>{
  const valid=headers.authorization==='Bearer qa-fixture-only';
  const answer=process.env.QA_FIXTURE_CASE==='metadata-only'
    ? 'The answer is not supported by the required cited edition. PDF page 79.'
    : 'Verified answer from '+process.env.QA_EXPECTED_CITATION+' with a detailed safety explanation.';
  return {status:valid?200:401,json:async()=>valid
    ? {mode:'standards_verified',answer,sources:[process.env.QA_EXPECTED_CITATION]}
    : {error:'unauthorized'}};
};`;
const loader='data:text/javascript,'+encodeURIComponent(preload);
function run(testCase,citation=expected){
  return spawnSync(process.execPath,['--import',loader,'scripts/qa-authenticated-ask-citation.mjs'],{
    cwd:new URL('../',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,''),
    env:{...process.env,QA_ASK_BASE_URL:'https://elevator.help',
      QA_CLERK_SESSION_JWT:'qa-fixture-only',QA_ASK_QUESTION:'EN 81-20 guardrail?',
      QA_EXPECTED_CITATION:citation,QA_FIXTURE_CASE:testCase},
    encoding:'utf8',timeout:12000,
  });
}
const positive=run('valid');
assert.equal(positive.status,0,'complete customer answer must pass synthetic gate');
const metadata=run('metadata-only');
assert.notEqual(metadata.status,0,'metadata-only citation must not pass');
const weak=run('valid','PDF-Seite 79');
assert.notEqual(weak.status,0,'source/edition/clause-free expectation must not pass');
const scattered=run('valid','DIN EN 81-20:2014-11 says unrelated words. Clause 5.4.7.4 elsewhere. PDF-Seite 79');
assert.notEqual(scattered.status,0,'scattered expectation must not authorize a signed-in release pass');
console.log('PASS: customer-answer citation required; metadata-only and weak expectations rejected (mocked fetch, no network)');
