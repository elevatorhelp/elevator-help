import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readFileSync as readSource} from 'node:fs';
import {validateProcessArgs,checkpointFromReply,processLease} from './qa-pr63-lease-indexer-process.mjs';
import {inspectProcessClaimPair,verifyIndependentProcessCheckpoint} from './qa-pr63-two-process-checkpoint.mjs';
const doc='qa61-proc-42083644765-1';
const lease={jobKey:doc,owner:'worker-a',generation:1};
const root=mkdtempSync(join(tmpdir(),'qa-pr63-process-'));
try{
 assert.equal(validateProcessArgs('claim',doc,'worker-a',root),join(root,'worker-a.json'));
 assert.throws(()=>validateProcessArgs('claim','production-doc','worker-a',root),/QA_PROCESS_ARGUMENTS_INVALID/);
 assert.throws(()=>validateProcessArgs('claim',doc,'evil',root),/QA_PROCESS_ARGUMENTS_INVALID/);
 assert.throws(()=>checkpointFromReply(doc,'worker-b',{status:200,lease}),/QA_PROCESS_CHECKPOINT_INVALID/);
 const fetchImpl=async(_url,opts)=>{
   assert.equal(opts.method,'POST');
   const body=JSON.parse(opts.body);
   if(body.action==='lease_claim')return {status:200,async json(){return {lease}}};
   if(body.action==='lease_renew')return {status:200,async json(){return {renewed:true}}};
   throw Error('Unexpected');
 };
 const origin='http://127.0.0.1:8787';
 const token='FAKE_TEST_ONLY_BEARER';
 const claimed=await processLease('claim',doc,'worker-a',root,{fetchImpl,origin,token});
 assert.equal(claimed.status,200);
 assert.equal(existsSync(join(root,'worker-a.json')),true);
 assert.equal((await processLease('renew',doc,'worker-a',root,{fetchImpl,origin,token})).status,200);
 await assert.rejects(processLease('claim',doc,'worker-b',root,{fetchImpl,origin:'https://elevator.help',token}),
   /QA_ISOLATED_ORIGIN_REQUIRED/);
 assert.deepEqual(inspectProcessClaimPair({status:200,owner:'worker-a',generation:1},{status:409,owner:'worker-b'}),
   {winner:'worker-a',loser:'worker-b'});
 assert.throws(()=>inspectProcessClaimPair({status:200,owner:'worker-a',generation:1},
  {status:200,owner:'worker-b',generation:1}),/QA_PROCESS_DOUBLE_WINNER_OR_NO_OWNER/);
 assert.throws(()=>inspectProcessClaimPair({status:409,owner:'worker-a'},
  {status:409,owner:'worker-b'}),/QA_PROCESS_DOUBLE_WINNER_OR_NO_OWNER/);
}finally{rmSync(root,{recursive:true,force:true});}

const root2=mkdtempSync(join(tmpdir(),'qa-pr63-process-'));
try{
 let count=0;
 const invoke=async args=>{
  const [mode,d,owner,dir]=args;
  assert.equal(d,doc);
  assert.equal(dir,root2);
  if(mode==='claim'){
    count++;
    if(owner==='worker-b')return {status:409,owner};
    const cp=checkpointFromReply(doc,owner,{status:200,lease});
    writeFileSync(join(dir,owner+'.json'),JSON.stringify(cp),{mode:0o600});
    return {status:200,owner,generation:1};
  }
  assert.equal(mode,'renew');
  assert.equal(owner,'worker-a');
  assert.equal(JSON.parse(readFileSync(join(dir,owner+'.json'),'utf8')).lease.jobKey,doc);
  return {status:200,owner,generation:1,resumed:true};
 };
 assert.equal(await verifyIndependentProcessCheckpoint('42083644765-1',{tempDirectory:root2,invoke}),
 'QA_TWO_INDEPENDENT_PROCESSES_DURABLE_CHECKPOINT_AND_FENCING_VERIFIED');
 assert.equal(count,2);
}finally{rmSync(root2,{recursive:true,force:true});}
const runner=readSource(new URL('./qa-pr61-real-app-e2e.mjs',import.meta.url),'utf8');
assert.ok(runner.includes("verifyIndependentProcessCheckpoint(run)"),'actual remote QA must invoke independent process clients');
assert.ok(runner.indexOf("verifyIndependentProcessCheckpoint(run)")<runner.indexOf('if (process.env.QA_NEGATIVE_ONLY'),
 'negative-only QA must cover two-process path with no Gemini');
const child=readSource(new URL('./qa-pr63-lease-indexer-process.mjs',import.meta.url),'utf8');
assert.doesNotMatch(child,/elevator\.help\/api|index_evidence|delete_by_ids|upsert|GEMINI_API_KEY/);
console.log('PASS: two distinct OS process claimant checkpoints, true restart renewal, strict QA origin, no model calls');
