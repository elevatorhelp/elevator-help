import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QA_VECTOR_INDEXES,fixtureForRun,qaIndexApi,seedOneGeneration,verifyRollbackPhysical,cleanupRunFixtures,classifyQaSeedReadback} from './qa-pr61-dual-vector-restore.mjs';
const fixture=fixtureForRun('42083644765');
assert.equal(fixture.old.metadata.sourceFileId,'qa-document');
assert.equal(fixture.newer.metadata.sourceFileId,'qa-document');
assert.equal(fixture.old.values.length,768);
assert.ok(fixture.old.id.startsWith('g2:') && fixture.newer.id.startsWith('g3:'));
assert.notEqual(fixture.old.id,fixture.newer.id);
for(const invalid of ['','qa-123','1','42083644765/3'])assert.throws(()=>fixtureForRun(invalid),/QA_DUAL_VECTOR_RUN_ID_INVALID/);


assert.equal(classifyQaSeedReadback([],fixture.old),'NOT_VISIBLE');
assert.equal(classifyQaSeedReadback([fixture.old],fixture.old),'READY');
const different={...fixture.old,metadata:{...fixture.old.metadata,sourceFingerprint:'wrong-qa-revision'}};
assert.equal(classifyQaSeedReadback([different],fixture.old),'METADATA_FINGERPRINT');
assert.equal(classifyQaSeedReadback([{id:fixture.old.id}],fixture.old),'METADATA_ABSENT');
assert.equal(classifyQaSeedReadback([{...fixture.old,metadata:{...fixture.old.metadata,page:999}}],fixture.old),
 'METADATA_PAGE');
assert.equal(classifyQaSeedReadback([{...fixture.old,id:'wrong-id'}],fixture.old),'WRONG_IDS');

// Simulate an async mutation that was accepted but is still invisible.
// No real Cloudflare read/write; status uses read-only /info when polls expire.
for(const processed of ['0000aaaa-11bb-22cc-33dd-444444eeeeee','different']) {
 const operations=[];
 const waitApi=async(index,action)=>{
   operations.push(action);
   if(action==='get_by_ids')return [];
   if(action==='insert')return {mutationId:'0000aaaa-11bb-22cc-33dd-444444eeeeee'};
   if(action==='info')return {processedUpToMutation:processed};
   throw Error('unexpected action');
 };
 const error=await seedOneGeneration(waitApi,fixture.old,{sleep:async()=>{},attempts:2})
   .then(()=>null,e=>e.message);
 assert.equal(error,processed==='different'
   ?'QA_DUAL_VECTOR_INSERT_VISIBILITY_UNCONFIRMED'
   :'QA_DUAL_VECTOR_INSERT_PROCESSED_BUT_ID_ABSENT');
 assert.ok(operations.includes('info'),'must diagnose server-side async mutation status');
 assert.equal(operations.filter(op=>op==='insert').length,2,
   'never reinsert or duplicate paid/async mutations while polling');
}
{
 const errorApi=async(index,action)=>{
   if(action==='get_by_ids')return action&&index?[]:[];
   if(action==='insert')return {mutationId:'fake'};
   throw Error('unexpected');
 };
 // absent metadata fail closed immediately rather than waiting full timeout
 let reads=0;
 const fastFailApi=async(index,action,body)=>{
   if(action==='get_by_ids'){
     reads++;
     if(reads<=2)return []; // pre-insert collision checks
     return [{...fixture.old,metadata:{...fixture.old.metadata,status:'invalid'}}];
   }
   if(action==='insert')return {mutationId:'fake'};
   throw Error('unexpected');
 };
 await assert.rejects(seedOneGeneration(fastFailApi,fixture.old,{sleep:async()=>{},attempts:2}),
   /QA_DUAL_VECTOR_READBACK_METADATA_STATUS/);
 assert.equal(reads,3,'invalid published metadata must fail on first visible read');
}

const data=new Map(QA_VECTOR_INDEXES.map(index=>[index,new Map()]));
const calls=[];
const api=async(index,action,body)=>{
 assert.ok(QA_VECTOR_INDEXES.includes(index),'No production index');
 calls.push({index,action});
 const state=data.get(index);
 if(action==='get_by_ids')return body.ids.filter(id=>state.has(id)).map(id=>structuredClone(state.get(id)));
 if(action==='insert'){state.set(body.vector.id,structuredClone(body.vector));return {mutationId:'test'};}
 if(action==='delete_by_ids'){for(const id of body.ids)state.delete(id);return {mutationId:'test'};}
 throw Error('Unexpected action');
};
const opt={sleep:async()=>{},attempts:2};
assert.equal(await seedOneGeneration(api,fixture.old,opt),'QA_DUAL_VECTOR_SEEDED_GENERATION_2');
assert.equal(await seedOneGeneration(api,fixture.newer,opt),'QA_DUAL_VECTOR_SEEDED_GENERATION_3');
assert.equal(await verifyRollbackPhysical(api,fixture.old,fixture.newer,2,opt),'QA_DUAL_VECTOR_PHYSICAL_D1_RESTORE_VERIFIED');
await assert.rejects(verifyRollbackPhysical(api,fixture.old,fixture.newer,3,opt),/QA_DUAL_VECTOR_RESTORED_GENERATION_MISMATCH/);
await assert.rejects(seedOneGeneration(api,fixture.old,opt),/QA_DUAL_VECTOR_ID_ALREADY_EXISTS/);
const altered=structuredClone(data.get(QA_VECTOR_INDEXES[1]).get(fixture.newer.id));
altered.metadata.sourceFingerprint='foreign-revision';
data.get(QA_VECTOR_INDEXES[1]).set(fixture.newer.id,altered);
await assert.rejects(cleanupRunFixtures(api,fixture,opt),/QA_DUAL_VECTOR_UNOWNED_DELETE_REFUSED/);
assert.equal(data.get(QA_VECTOR_INDEXES[1]).has(fixture.newer.id),true);
data.get(QA_VECTOR_INDEXES[1]).set(fixture.newer.id,fixture.newer);
assert.equal(await cleanupRunFixtures(api,fixture,opt),'QA_DUAL_VECTOR_FIXTURES_CLEANED');
for(const index of QA_VECTOR_INDEXES)assert.equal(data.get(index).size,0);

let observedNdjson=null;
const cf=qaIndexApi({accountId:'a'.repeat(32),token:'fake-token',fetchImpl:async(url,opts)=>{
 assert.ok(String(url).startsWith('https://api.cloudflare.com/client/v4/accounts/'));
 assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');
 assert.equal(opts.headers.Authorization,'Bearer fake-token');
 if(String(url).endsWith('/insert')){
   assert.equal(opts.headers['Content-Type'],'application/x-ndjson');
   assert.equal(typeof opts.body,'string','insert must use raw NDJSON, not multipart');
   assert.equal(opts.body.endsWith('\\n'),false,'literal slash-n is not a valid NDJSON record delimiter');
   assert.ok(opts.body.endsWith('\n'),'raw NDJSON must end with newline');
   observedNdjson=opts.body;
 }else assert.equal(opts.headers['Content-Type'],'application/json');
 return {status:200,async json(){return {success:true,result:{mutationId:'qa'}}}};
}});
await cf(QA_VECTOR_INDEXES[0],'insert',{vector:fixture.old});
assert.deepEqual(JSON.parse(observedNdjson),fixture.old);
const failing=qaIndexApi({accountId:'a'.repeat(32),token:'fake-token',fetchImpl:async()=>({
 status:400,async json(){return {success:false,errors:[{code:40023,message:'SECRET_STRING_MUST_NOT_APPEAR'}]};},
})});
const error=await failing(QA_VECTOR_INDEXES[0],'insert',{vector:fixture.old}).then(()=>null,e=>e.message);
assert.equal(error,'QA_DUAL_VECTOR_INSERT_HTTP_400_CF_40023');
assert.ok(!error.includes('SECRET_STRING_MUST_NOT_APPEAR'));
await assert.rejects(cf('elevator-help-index','delete_by_ids',{ids:[fixture.old.id]}),/QA_DUAL_VECTOR_TARGET_DISALLOWED/);
await assert.rejects(cf(QA_VECTOR_INDEXES[0],'upsert',{vector:fixture.old}),/QA_DUAL_VECTOR_TARGET_DISALLOWED/);
assert.equal(calls.some(c=>c.index==='elevator-help-multilingual-v2'),false);

const launcher=readFileSync(new URL('../.github/workflows/qa-pr61-actual-app.yml',import.meta.url),'utf8');
const child=readFileSync(new URL('../.github/workflows/qa-pr61-d1-restore.yml',import.meta.url),'utf8');
assert.match(launcher,/verify_dual_vector_restore:[\s\S]*?default: false/);
assert.match(child,/verify_dual_vector_restore:[\s\S]*?default: false/);
assert.ok(launcher.includes('verify_dual_vector_restore: $'+'{{ inputs.verify_dual_vector_restore == true }}'));
assert.ok(launcher.includes('inputs.verify_dual_vector_restore == false'));
for(const item of ['Verify both QA Vectorize index configurations before write','seed-old','seed-new',
 'scripts/qa-pr61-dual-vector-restore.mjs verify','scripts/qa-pr61-dual-vector-restore.mjs cleanup',
 'always() && inputs.verify_dual_vector_restore == true'])assert.ok(child.includes(item),item);
const old=child.indexOf('scripts/qa-pr61-dual-vector-restore.mjs seed-old');
const newer=child.indexOf('scripts/qa-pr61-dual-vector-restore.mjs seed-new');
const restore=child.indexOf('time-travel restore');
const verify=child.indexOf('scripts/qa-pr61-dual-vector-restore.mjs verify');
const cleanup=child.indexOf('scripts/qa-pr61-dual-vector-restore.mjs cleanup');
assert.ok(old>0&&newer>old&&restore>newer&&verify>restore&&cleanup>verify);
for(const name of ['elevator-help-index','elevator-help-multilingual-v2'])assert.ok(!child.includes(name));
console.log('PASS: dual-physical Vectorize post-D1 rollback metadata, active generation fence, isolation and safe cleanup');
