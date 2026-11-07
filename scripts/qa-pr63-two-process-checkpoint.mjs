// Two *independent OS processes* simulate indexer lease acquisition.
// A new process resumes the winner's own durable checkpoint; the loser has none.
// Neither process performs Drive, Gemini, Vectorize, or Production operations.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdtempSync,existsSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {checkpointFromReply} from './qa-pr63-lease-indexer-process.mjs';
const execFileAsync=promisify(execFile);
export function inspectProcessClaimPair(first,second){
 const outcomes=[first,second],winner=outcomes.filter(x=>x?.status===200);
 const loser=outcomes.filter(x=>x?.status===409);
 assert.equal(winner.length,1,'QA_PROCESS_DOUBLE_WINNER_OR_NO_OWNER');
 assert.equal(loser.length,1,'QA_PROCESS_LOSER_NOT_FENCED');
 assert.notEqual(winner[0].owner,loser[0].owner);
 assert.ok(['worker-a','worker-b'].includes(winner[0].owner));
 assert.equal(winner[0].generation,1);
 return {winner:winner[0].owner,loser:loser[0].owner};
}
export async function verifyIndependentProcessCheckpoint(runId,{
 invoke=null,tempDirectory=null,
}={}){
 if(!/^[1-9]\d{5,19}-[1-9]\d{0,5}$/.test(runId))
   throw Error('QA_PROCESS_RUN_ID_INVALID');
 const root=tempDirectory??mkdtempSync(join(tmpdir(),'qa-pr63-process-'));
 const workerScript=fileURLToPath(new URL('./qa-pr63-lease-indexer-process.mjs',import.meta.url));
 const child=invoke??(async args=>{
   const result=await execFileAsync(process.execPath,[workerScript,...args],{
     env:process.env,timeout:45000,maxBuffer:4096,
   });
   return JSON.parse(result.stdout.trim());
 });
 try{
   const doc='qa61-proc-'+runId;
   const [a,b]=await Promise.all([
     child(['claim',doc,'worker-a',root]),
     child(['claim',doc,'worker-b',root]),
   ]);
   const {winner,loser}=inspectProcessClaimPair(a,b);
   const saved=join(root,winner+'.json');
   assert.equal(existsSync(saved),true,'QA_PROCESS_WINNER_CHECKPOINT_MISSING');
   assert.equal(existsSync(join(root,loser+'.json')),false,'QA_PROCESS_LOSER_WRONG_CHECKPOINT');
   const state=JSON.parse(readFileSync(saved,'utf8'));
   checkpointFromReply(doc,winner,{status:200,lease:state.lease});
   assert.equal(statSync(saved).mode&0o077,0,'QA_PROCESS_CHECKPOINT_NOT_PRIVATE');
   const resumed=await child(['renew',doc,winner,root]);
   assert.equal(resumed?.status,200,'QA_PROCESS_RESTART_RENEW_FAILED');
   assert.equal(resumed.resumed,true);
   assert.equal(resumed.owner,winner);
   assert.equal(resumed.generation,1,'QA_PROCESS_GENERATION_CHANGED');
   return 'QA_TWO_INDEPENDENT_PROCESSES_DURABLE_CHECKPOINT_AND_FENCING_VERIFIED';
 }finally{
   if(tempDirectory==null)rmSync(root,{recursive:true,force:true});
 }
}
