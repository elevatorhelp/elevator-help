/**
 * Issue106 QA state inspection. Strictly read-only D1; NEVER prints raw
 * checkpoint JSON, PDF names, chunk IDs, prompts, credentials, or tokens.
 * No Gemini/Vectorize/Worker process calls.
 */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
const allowed=["A","B"];
const die=marker=>{throw Error(marker);};
export function summarizeQa106D1(rows,now=Date.now()){
 if(!Array.isArray(rows))die("QA106_DIAG_D1_BAD_ROWS");
 const out=[];
 for(const slot of allowed){
   const matches=rows.filter(r=>r?.job_key===qa106JobKey(slot));
   if(matches.length!==1){out.push({slot,state:"missing_or_duplicate"});continue;}
   const r=matches[0];
   let state;
   try{state=JSON.parse(r.state_json);}catch{out.push({slot,state:"invalid_checkpoint"});continue;}
   const scope=state?.scopes?.[QA106_ROOT];
   const rec=scope?.v2Files?.[QA106_PDFS[slot]];
   if(!rec){out.push({slot,state:"wrong_scope"});continue;}
   const fp=rec?.v2SourceFingerprint;
   const same=v=>typeof fp==="string"&&/^[0-9a-f]{64}$/.test(fp)&&v===fp;
   const safeNum=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:null;
   out.push({
     slot,state:"present",
     version:safeNum(r.version),
     activeLease:Number.isFinite(Number(r.lease_until_ms)) && Number(r.lease_until_ms)>now,
     lastPhase:["evidence","raw","map"].includes(scope.v2LastSelectedPhase)?
       scope.v2LastSelectedPhase:"unknown",
     evidence:same(rec.evidenceFingerprint),
     raw:same(rec.rawFingerprint),
     map:same(rec.mapFingerprint),
     published:same(rec.publishedFingerprint),
     partialRawCount:safeNum(rec.partialRawIds?.length)??0,
     partialMapCount:safeNum(rec.partialMapIds?.length)??0,
     rawNextChunk:safeNum(rec.rawNextChunk),
     mapNextPage:safeNum(rec.mapNextPage),
   });
 }
 return out;
}
async function main(){
 if(process.env.GITHUB_ACTIONS!=="true" ||
    process.env.GITHUB_REF!=="refs/heads/main" ||
    process.env.GITHUB_EVENT_NAME!=="push")die("QA106_DIAG_WRONG_EXECUTION_CONTEXT");
 const sql="SELECT c.job_key,c.version,c.state_json,l.lease_until_ms "+
  "FROM ingestion_worker_checkpoints c LEFT JOIN ingestion_global_leases l "+
  "ON c.job_key=l.job_key WHERE c.job_key IN ('"+
  qa106JobKey("A")+"','"+qa106JobKey("B")+"');";
 let out;
 try{
  out=execFileSync("npx",["wrangler","d1","execute","elevator-help-lease-test-01",
     "--remote","--config","wrangler.qa-pr100-v2.json","--json","--command",sql],
   {encoding:"utf8",maxBuffer:2*1024*1024,timeout:100000,
    stdio:["ignore","pipe","ignore"]});
 }catch{die("QA106_DIAG_READ_ONLY_D1_UNAVAILABLE");}
 let data;
 try{data=JSON.parse(out);}catch{die("QA106_DIAG_D1_BAD_JSON");}
 const batches=Array.isArray(data)?data:[data];
 if(batches.some(b=>!Array.isArray(b.results)))die("QA106_DIAG_D1_BAD_RESULT");
 const result=summarizeQa106D1(batches.flatMap(b=>b.results));
 for(const r of result){
   if(r.state!=="present"){
      console.log("QA106_D1_"+r.slot+"_"+r.state.toUpperCase());continue;
   }
   console.log("QA106_D1_"+r.slot+
     " checkpoint_version="+r.version+
     " active_lease="+r.activeLease+
     " last_selected="+r.lastPhase+
     " evidence="+r.evidence+" raw="+r.raw+
     " map="+r.map+" published="+r.published+
     " partial_raw_ids="+r.partialRawCount+
     " raw_next_chunk="+(r.rawNextChunk??"none")+
     " partial_map_ids="+r.partialMapCount+
     " map_next_page="+(r.mapNextPage??"none"));
 }
 console.log("QA106_D1_DIAGNOSTIC_READONLY_COMPLETE");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{
  const m=String(e?.message||"");
  console.error("::error::"+(/^QA106_DIAG_[A-Z0-9_]+$/.test(m)?m:"QA106_DIAG_ABORTED"));
  process.exitCode=1;
 });
