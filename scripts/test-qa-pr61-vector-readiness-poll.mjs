import assert from 'node:assert/strict';
import {
  QA_VECTOR_READBACK_ATTEMPTS,
  QA_VECTOR_READBACK_DELAY_MS,
  publishAfterVectorsAreReady,
} from './qa-pr61-wait-for-staged-vectors.mjs';

const notReady=()=>({status:409,error:'STAGED_VECTOR_NOT_READY'});
const published=()=>({status:200,ok:true,published:true});
const waits=[];const sleep=async ms=>waits.push(ms);
assert.equal(QA_VECTOR_READBACK_ATTEMPTS,24);
assert.equal(QA_VECTOR_READBACK_DELAY_MS,5000);
{
  let calls=0;
  const result=await publishAfterVectorsAreReady(async()=>{
    calls++;
    return calls===3?published():notReady();
  },{sleep});
  assert.equal(result.published,true);
  assert.equal(calls,3);
  assert.deepEqual(waits,[5000,5000]);
}
{
  let calls=0;
  const forbidden={status:409,error:'STAGED_MANIFEST_MISMATCH'};
  const result=await publishAfterVectorsAreReady(async()=>{calls++;return forbidden},{sleep});
  assert.deepEqual(result,forbidden);
  assert.equal(calls,1,'unexpected conflicts must not be retried');
}
{
  let calls=0;
  const result=await publishAfterVectorsAreReady(async()=>{
    calls++;return {status:200,published:false};
  },{sleep});
  assert.equal(result.published,false);
  assert.equal(calls,1,'HTTP 200 without publication must not be treated as success');
}
{
  let calls=0;
  let countWait=0;
  await assert.rejects(publishAfterVectorsAreReady(async()=>{
    calls++;
    return notReady();
  },{sleep:async ms=>{assert.equal(ms,5000);countWait++;}}),
  /QA_STAGED_VECTORS_NOT_READY_AFTER_BOUNDED_RETRIES/);
  assert.equal(calls,QA_VECTOR_READBACK_ATTEMPTS);
  assert.equal(countWait,QA_VECTOR_READBACK_ATTEMPTS-1);
}
{
  let calls=0;
  await assert.rejects(publishAfterVectorsAreReady(async()=>{
    calls++;
    throw Error('Vectorize read transport failed');
  },{sleep}),/Vectorize read transport failed/);
  assert.equal(calls,1,'unknown transport failure must not be hidden or retried');
}
const noDbOrEmbeddingFunctions = await import('node:fs').then(fs=>fs.readFileSync(
 new URL('./qa-pr61-wait-for-staged-vectors.mjs',import.meta.url),'utf8'));
assert.doesNotMatch(noDbOrEmbeddingFunctions,/\b(?:upsert|insert|deleteByIds|GEMINI_API_KEY|fetch\(|npx)\s*\(/,
 'readiness polling may not re-embed, write vectors or change databases');
console.log('PASS: asynchronous Vectorize QA readiness retry bounded, fail-closed and no duplicate paid writes');
