// Isolated QA Vectorize fixtures for a real disposable-D1 Time Travel drill.
// Never creates/deletes indexes, references Production, calls Gemini, or
// uses IDs outside the exact run. REST Vectorize mutations are asynchronous.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {filterPublishedMatches} from '../app/lib/ingestion-publication-visibility.ts';
import {hasExactQaVectorReadback} from './qa-pr61-vector-readback.mjs';

export const QA_VECTOR_INDEXES=Object.freeze(['elevator-help-staging-test','elevator-help-staging-test-v2']);
export const QA_VECTOR_ATTEMPTS=18;
export const QA_VECTOR_DELAY_MS=3000;

export function fixtureForRun(runId,attempt='1'){
  if(!/^[1-9]\d{5,19}$/.test(runId)||!/^[1-9]\d{0,4}$/.test(attempt))
    throw Error('QA_DUAL_VECTOR_RUN_ID_INVALID');
  const suffix=runId+'-'+attempt;
  const documentId='qa-restore-'+suffix;
  const make=(gen)=>({
    id:'g'+gen+':qavr-'+suffix+'-'+gen,
    values:[1,...Array(767).fill(0)],
    metadata:{
      status:'active',text:'Isolated D1 rollback source generation '+gen,
      fileName:'qa-restore.pdf',sourcePath:'qa/restore/'+suffix,
      sourceFileId:documentId,sourceFingerprint:'qa-fingerprint-'+gen,
      page:gen,chunkIndex:0,contentType:'application/pdf',
    },
  });
  return {documentId,old:make(2),newer:make(3)};
}

function classifyResponse(response,body,action){
 if(response.status!==200||body?.success!==true)
   throw Error('QA_DUAL_VECTOR_'+action+'_HTTP_'+String(response.status));
 return body;
}
export function qaIndexApi({accountId,token,fetchImpl=fetch}){
 if(!/^[0-9a-f]{32}$/i.test(accountId||'')||!token)
   throw Error('QA_DUAL_VECTOR_CREDENTIALS_REQUIRED');
 const root='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/vectorize/v2/indexes/';
 return async(index,action,params)=>{
   if(!QA_VECTOR_INDEXES.includes(index)||!['get_by_ids','insert','delete_by_ids'].includes(action))
     throw Error('QA_DUAL_VECTOR_TARGET_DISALLOWED');
   const url=root+index+'/'+action;
   const body=action==='insert'
     ? (()=>{const f=new FormData();f.append('vectors',new Blob([JSON.stringify(params.vector)+'\n'],{type:'application/x-ndjson'}),'fixture.ndjson');return f;})()
     : JSON.stringify({ids:params.ids});
   const response=await fetchImpl(url,{
     method:'POST',
     headers:action==='insert'?{Authorization:'Bearer '+token}:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body,redirect:'error',signal:AbortSignal.timeout(30000),
   });
   let result;
   try{result=await response.json();}catch{throw Error('QA_DUAL_VECTOR_'+action+'_BAD_JSON');}
   classifyResponse(response,result,action.toUpperCase());
   if(action==='get_by_ids')
     return Array.isArray(result.result)?result.result:
       Array.isArray(result.result?.vectors)?result.result.vectors:[];
   return result.result;
 };
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function pollPhysical(api,index,ids,desired,{sleep=pause,attempts=QA_VECTOR_ATTEMPTS}={}){
 for(let i=0;i<attempts;i++){
   const got=await api(index,'get_by_ids',{ids});
   if(desired(got))return got;
   if(i<attempts-1)await sleep(QA_VECTOR_DELAY_MS);
 }
 throw Error('QA_DUAL_VECTOR_PHYSICAL_READBACK_TIMEOUT');
}
export async function seedOneGeneration(api,fixture,{sleep=pause,attempts=QA_VECTOR_ATTEMPTS}={}){
 // Fail closed on any collision before writing to either index.
 for(const index of QA_VECTOR_INDEXES){
   const current=await api(index,'get_by_ids',{ids:[fixture.id]});
   if(current.length)throw Error('QA_DUAL_VECTOR_ID_ALREADY_EXISTS');
 }
 for(const index of QA_VECTOR_INDEXES)
   await api(index,'insert',{vector:fixture});
 for(const index of QA_VECTOR_INDEXES)
   await pollPhysical(api,index,[fixture.id],r=>
     hasExactQaVectorReadback(r,[fixture.id],fixture.metadata.sourceFileId,
       fixture.metadata.sourceFingerprint,new Map([[fixture.id,fixture.metadata.page]])),{sleep,attempts});
 return 'QA_DUAL_VECTOR_SEEDED_GENERATION_'+fixture.metadata.page;
}
export async function verifyRollbackPhysical(api,old,next,activeGen,{sleep=pause,attempts=QA_VECTOR_ATTEMPTS}={}){
 assert.equal(activeGen,2,'QA_DUAL_VECTOR_RESTORED_GENERATION_MISMATCH');
 for(const index of QA_VECTOR_INDEXES){
   const ids=[old.id,next.id];
   const physical=await pollPhysical(api,index,ids,r=>r.length===2,{sleep,attempts});
   for(const vector of [old,next]){
     assert.ok(hasExactQaVectorReadback(physical.filter(r=>r.id===vector.id),
       [vector.id],vector.metadata.sourceFileId,
       vector.metadata.sourceFingerprint,new Map([[vector.id,vector.metadata.page]])),
       'QA_DUAL_VECTOR_INVALID_PHYSICAL_PROVENANCE');
   }
   const db={
     prepare:()=>({bind:document=>({first:async()=>{
       assert.equal(document,old.metadata.sourceFileId);
       return {active_generation:activeGen};
     }})}),
   };
   const visible=await filterPublishedMatches(db,physical,true);
   assert.deepEqual(visible.map(v=>v.id),[old.id],
     'QA_DUAL_VECTOR_SUPERSEDED_GENERATION_VISIBLE');
 }
 return 'QA_DUAL_VECTOR_PHYSICAL_D1_RESTORE_VERIFIED';
}
export async function cleanupRunFixtures(api,fixtures,{sleep=pause,attempts=QA_VECTOR_ATTEMPTS}={}){
 const ids=[fixtures.old.id,fixtures.newer.id];
 for(const index of QA_VECTOR_INDEXES){
   const current=await api(index,'get_by_ids',{ids});
   // Never remove a foreign vector merely because its ID happens to match.
   for(const vector of current){
     const expected=[fixtures.old,fixtures.newer].find(x=>x.id===vector.id);
     if(!expected||!hasExactQaVectorReadback([vector],[expected.id],
       expected.metadata.sourceFileId,expected.metadata.sourceFingerprint,
       new Map([[expected.id,expected.metadata.page]])))
       throw Error('QA_DUAL_VECTOR_UNOWNED_DELETE_REFUSED');
   }
   if(current.length)await api(index,'delete_by_ids',{ids:current.map(v=>v.id)});
 }
 for(const index of QA_VECTOR_INDEXES)
   await pollPhysical(api,index,ids,r=>r.length===0,{sleep,attempts});
 return 'QA_DUAL_VECTOR_FIXTURES_CLEANED';
}
export function readDisposableD1Generation(dbName,runId){
 if(dbName!=='qa-pr61-restore-'+runId)throw Error('QA_DUAL_VECTOR_DISPOSABLE_D1_REQUIRED');
 const output=execFileSync('npx',['wrangler','d1','execute',dbName,'--remote',
  '--command',"SELECT active_generation FROM ingestion_document_publications WHERE document_id='qa-document'",'--json'],
  {encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']});
 let rows;
 try{rows=JSON.parse(output).flatMap(x=>x.results||[]);}catch{throw Error('QA_DUAL_VECTOR_D1_INVALID_JSON');}
 if(rows.length!==1||rows[0].active_generation!==2)
   throw Error('QA_DUAL_VECTOR_D1_RESTORED_GENERATION_MISMATCH');
 return 2;
}
async function main(){
 const action=process.argv[2];
 if(!['seed-old','seed-new','verify','cleanup'].includes(action))
   throw Error('QA_DUAL_VECTOR_ACTION_INVALID');
 const runId=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT||'1';
 const fixture=fixtureForRun(runId,attempt);
 const api=qaIndexApi({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
 if(action==='seed-old')return seedOneGeneration(api,fixture.old);
 if(action==='seed-new')return seedOneGeneration(api,fixture.newer);
 if(action==='verify'){
   const generation=readDisposableD1Generation(process.env.QA_DB,runId);
   return verifyRollbackPhysical(api,fixture.old,fixture.newer,generation);
 }
 return cleanupRunFixtures(api,fixture);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log('PASS: '+await main());}catch(e){
  const message=e instanceof Error?e.message:'';
  const safe=/^QA_DUAL_VECTOR_[A-Z0-9_]+$/.test(message)?message:'QA_DUAL_VECTOR_CHECK_FAILED';
  console.error('::error::'+safe);
  process.exitCode=1;
 }
}
