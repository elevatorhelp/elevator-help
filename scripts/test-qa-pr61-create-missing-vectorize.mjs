import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  QA_INDEX,QA_LEGACY_INDEX,approvedQaIndexCreationRequest,
  hasExactIndexConfiguration,provisionQaMultilingualIndex,
} from './qa-pr61-create-missing-vectorize.mjs';

const host='https://api.cloudflare.com/client/v4/accounts/'+'a'.repeat(32)+'/vectorize/v2/indexes';
const qaLegacy=host+'/elevator-help-staging-test';
const qaV2=host+'/elevator-help-staging-test-v2';
const payload=index=>({success:true,result:{
  name:index.name,config:{dimensions:index.dimensions,metric:index.metric},
}});
const response=(status,value)=>({
  status,async json(){return value;},
});
function harness({v2InitiallyExists=false,creationStatus=201,badLegacy=false,v2Metric='cosine',failureAt=null}={}){
  let created=v2InitiallyExists;
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url,method:options.method,headers:options.headers,body:options.body});
    if(failureAt===url) return response(403,{privateToken:'MUST_NOT_LOG'});
    if(url===qaLegacy && options.method==='GET')
      return response(200,payload(badLegacy?{...QA_LEGACY_INDEX,dimensions:512}:QA_LEGACY_INDEX));
    if(url===qaV2 && options.method==='GET')
      return created?response(200,payload({...QA_INDEX,metric:v2Metric})):response(404,{privateToken:'MUST_NOT_LOG'});
    if(url===host && options.method==='POST'){
      assert.deepEqual(JSON.parse(options.body),approvedQaIndexCreationRequest());
      if(creationStatus===201||creationStatus===200) created=true;
      return response(creationStatus,{privateToken:'MUST_NOT_LOG'});
    }
    throw Error('Unexpected request');
  };
  return {calls,fetchImpl};
}
const args={accountId:'a'.repeat(32),token:'A_FAKE_TOKEN_NEVER_LOG',pause:async()=>{}};
assert.deepEqual(approvedQaIndexCreationRequest(),{
  name:'elevator-help-staging-test-v2',
  description:'Isolated multilingual QA index for elevator-help PR63',
  config:{dimensions:768,metric:'cosine'},
});
assert.equal(hasExactIndexConfiguration(payload(QA_INDEX),QA_INDEX),true);
assert.equal(hasExactIndexConfiguration(payload({...QA_INDEX,dimensions:512}),QA_INDEX),false);
{
  const f=harness();
  const result=await provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl});
  assert.equal(result,'QA_MULTILINGUAL_INDEX_CREATED_VERIFIED');
  assert.deepEqual(f.calls.map(c=>[c.method,c.url]),[
    ['GET',qaLegacy],['GET',qaV2],['POST',host],['GET',qaV2],
  ]);
  assert.ok(f.calls.every(c=>!c.url.includes('elevator-help-multilingual-v2')));
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  assert.ok(f.calls.every(c=>c.headers.Authorization==='Bearer '+args.token));
}
{
  const f=harness({v2InitiallyExists:true});
  assert.equal(await provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl}),
               'QA_MULTILINGUAL_INDEX_ALREADY_VERIFIED');
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
}
{
  const f=harness({badLegacy:true});
  await assert.rejects(provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl}),
    /QA_LEGACY_INDEX_CONFIG_MISMATCH/);
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
}
{
  const f=harness({failureAt:qaV2});
  await assert.rejects(provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl}),
    /QA_MULTILINGUAL_INDEX_LOOKUP_HTTP_403/);
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
}
{
  const f=harness({creationStatus:403});
  const error=await provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl})
   .then(()=>null,e=>e.message);
  assert.equal(error,'QA_MULTILINGUAL_CREATE_HTTP_403');
  assert.ok(!error.includes('MUST_NOT_LOG')&&!error.includes(args.token));
}
{
  const f=harness({v2InitiallyExists:true,v2Metric:'euclidean'});
  await assert.rejects(provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl}),
    /QA_MULTILINGUAL_INDEX_CONFIG_MISMATCH/);
  assert.equal(f.calls.some(c=>c.method==='POST'),false);
}
{
  const f=harness();
  await assert.rejects(provisionQaMultilingualIndex({...args,fetchImpl:f.fetchImpl,accountId:'bad'}),
    /QA_CLOUDFLARE_CREDENTIALS_INVALID/);
  assert.equal(f.calls.length,0);
}
const workflow=readFileSync(new URL('../.github/workflows/qa-pr61-actual-app.yml',import.meta.url),'utf8');
assert.match(workflow,/create_missing_qa_vectorize:[\s\S]*?default: false/,
  'QA-only index creation must require explicit manual opt-in');
assert.match(workflow,/inputs\.create_missing_qa_vectorize == true/,
  'creation step must have a separate true-only condition');
const createStep=workflow.indexOf('node scripts/qa-pr61-create-missing-vectorize.mjs');
const preflight=workflow.indexOf('node scripts/qa-pr61-verify-vectorize-readonly.mjs');
const guard=workflow.indexOf('node scripts/qa-pr61-assert-isolated-config.mjs');
const d1=workflow.indexOf('npx wrangler d1 execute elevator-help-lease-test-01');
assert.ok(guard>=0&&createStep>guard&&preflight>createStep&&d1>preflight,
  'creation must follow safeguards and precede read-only preflight and D1 mutation');
assert.doesNotMatch(workflow,/^\s*(?:schedule|push|workflow_run):/m);
console.log('PASS: QA-only fixed-index creation, exact configuration and manual opt-in, no production index writes');
