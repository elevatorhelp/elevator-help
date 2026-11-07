import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Network-denied synthetic fixture: validates the release QA gate, NOT Clerk itself.
const expected='DIN EN 81-20:2014-11 §5.4.7.4, PDF-Seite 79';
const preload=`
globalThis.fetch=async (_url,{headers,redirect})=>{
  if(redirect!=='manual')throw Error('QA fetch must refuse redirects');
  const scenario=process.env.QA_FIXTURE_CASE;
  const authorization=headers.authorization;
  const valid=authorization==='Bearer qa-fixture-only';
  const allowed=valid||scenario==='auth-bypass'||(scenario==='invalid-bypass'&&authorization==='Bearer invalid.qa.session');
  const status=!allowed?401:scenario==='redirect'?302:200;
  const answer=scenario==='metadata-only'
    ? 'The answer is not supported by the required cited edition. PDF page 79.'
    : scenario==='printed-only' ? 'This text mentions printed standard page 79, not the physical PDF page.'
    : scenario==='short-answer' ? 'Short.'
    : 'Verified answer from '+process.env.QA_EXPECTED_CITATION+' with a detailed safety explanation.';
  return {status,json:async()=>status===200
    ? {mode:scenario==='unverified-mode'?'standards_web_fallback':'standards_verified',answer,sources:[process.env.QA_EXPECTED_CITATION]}
    : {error:'unauthorized'}};
};`
const loader='data:text/javascript,'+encodeURIComponent(preload);
function run(testCase,citation=expected,baseUrl='https://elevator.help'){
  return spawnSync(process.execPath,['--import',loader,'scripts/qa-authenticated-ask-citation.mjs'],{
    cwd:new URL('../',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,''),
    env:{...process.env,QA_ASK_BASE_URL:baseUrl,
      QA_CLERK_SESSION_JWT:'qa-fixture-only',QA_ASK_QUESTION:'EN 81-20 guardrail?',
      QA_EXPECTED_CITATION:citation,QA_FIXTURE_CASE:testCase},
    encoding:'utf8',timeout:12000,
  });
}
const positive=run('valid');
assert.equal(positive.status,0,'complete customer answer must pass synthetic gate');
for(const scenario of ['metadata-only','auth-bypass','invalid-bypass','unverified-mode','printed-only','short-answer','redirect']){
  const negative=run(scenario);
  assert.notEqual(negative.status,0,scenario+' must fail the signed-in customer release gate');
}
const weak=run('valid','PDF-Seite 79');
assert.notEqual(weak.status,0,'source/edition/clause-free expectation must not pass');
const scattered=run('valid','DIN EN 81-20:2014-11 says unrelated words. Clause 5.4.7.4 elsewhere. PDF-Seite 79');
assert.notEqual(scattered.status,0,'scattered expectation must not authorize a signed-in release pass');
for(const wrongOrigin of ['https://attacker.example','https://elevator.help.attacker.example','http://elevator.help','https://elevator.help:8443']){
  const wrong=run('valid',expected,wrongOrigin);
  assert.notEqual(wrong.status,0,'Clerk bearer must never be sent to unapproved origin: '+wrongOrigin);
}
console.log('PASS: signed-in release QA rejects missing/invalid auth bypass, wrong mode, redirects, metadata-only, weak/printed-page citations and unsafe origins (mocked fetch, no network)');
