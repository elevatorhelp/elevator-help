// Isolated, disposable QA-only "indexer" process: lease/checkpoint probe.
// This does NOT process PDFs, call Gemini, modify vectors or address Production.
// Each process persists its own lease checkpoint and exits. A fresh process can
// replay it to test durable resume against the remote QA D1.
import assert from 'node:assert/strict';
import {resolve,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {requirePr61LoopbackQaOrigin} from './qa-pr61-isolated-origin.mjs';
import {parseQaDriveRecoveryResponse} from './qa-drive-recovery-response.mjs';

export function validateProcessArgs(mode,documentId,owner,root){
 if(!['claim','renew'].includes(mode)||!/^qa61-proc-[1-9]\d{5,19}-[1-9]\d{0,5}$/.test(documentId||'')
 || !['worker-a','worker-b'].includes(owner) || typeof root!=='string'
 || !basename(root).startsWith('qa-pr63-process-'))
   throw Error('QA_PROCESS_ARGUMENTS_INVALID');
 return join(resolve(root),owner+'.json');
}
export function checkpointFromReply(documentId,owner,response){
 assert.equal(response?.status,200,'QA_PROCESS_LEASE_CLAIM_REQUIRED');
 const lease=response.lease;
 if(lease?.jobKey!==documentId||lease?.owner!==owner||
    !Number.isSafeInteger(lease?.generation)||lease.generation<1)
   throw Error('QA_PROCESS_CHECKPOINT_INVALID');
 return {documentId,owner,lease};
}
export async function processLease(mode,documentId,owner,root,{
 fetchImpl=fetch,origin,token,
}={}){
 const path=validateProcessArgs(mode,documentId,owner,root);
 const base=requirePr61LoopbackQaOrigin(origin);
 if(typeof token!=='string'||token.length<16)throw Error('QA_PROCESS_TOKEN_REQUIRED');
 const post=async body=>{
   const response=await fetchImpl(new URL('/api/drive-ingest-batch',base),{
     method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},
     body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000),
   });
   return parseQaDriveRecoveryResponse(response);
 };
 if(mode==='claim'){
   const result=await post({action:'lease_claim',documentId,owner,durationMs:180000});
   if(result.status===409)return {status:409,owner};
   const checkpoint=checkpointFromReply(documentId,owner,result);
   const tmp=path+'.tmp';
   writeFileSync(tmp,JSON.stringify(checkpoint),{flag:'wx',mode:0o600});
   renameSync(tmp,path);
   return {status:200,owner,generation:checkpoint.lease.generation};
 }
 const checkpoint=JSON.parse(readFileSync(path,'utf8'));
 if(checkpoint.documentId!==documentId||checkpoint.owner!==owner||
    checkpoint.lease?.jobKey!==documentId||checkpoint.lease.owner!==owner)
   throw Error('QA_PROCESS_CHECKPOINT_MISMATCH');
 const renew=await post({action:'lease_renew',lease:checkpoint.lease,durationMs:180000});
 if(renew.status!==200)throw Error('QA_PROCESS_RESUME_RENEW_DENIED');
 return {status:200,owner,generation:checkpoint.lease.generation,resumed:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
   const [mode,documentId,owner,root]=process.argv.slice(2);
   const result=await processLease(mode,documentId,owner,root,{
     origin:process.env.QA_APP_BASE_URL,
     token:process.env.QA_INGESTION_TOKEN,
   });
   console.log(JSON.stringify(result));
 }catch{
   console.error('::error::QA_PROCESS_CHECKPOINT_OR_LEASE_FAILED');
   process.exitCode=1;
 }
}
