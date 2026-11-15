/**
 * Issue106: fail-closed, READ-ONLY preflight for the owner-approved retry.
 * Reads only two known QA D1 checkpoint rows and Google file metadata.
 * Does not call Gemini, modify D1, download PDFs, or deploy Workers.
 */
import assert from "node:assert/strict";
import {createSign} from "node:crypto";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {QA106_ROOT,QA106_PDFS,QA106_CONFIRM,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
import {fingerprint} from "./drive-ingest.mjs";
const allowedSlots=["A","B"];
const code=(valid,marker)=>{if(!valid)throw Error(marker);};
const digestRe=/^[a-f0-9]{64}$/;

export function verifyResumeRows(rows,expected,now=Date.now()){
  code(Array.isArray(rows)&&rows.length===2,"QA106_RESUME_TWO_CHECKPOINTS_REQUIRED");
  const results=[];
  for(const slot of allowedSlots){
    const jobKey=qa106JobKey(slot);
    const matching=rows.filter(row=>row.job_key===jobKey);
    code(matching.length===1,"QA106_RESUME_JOB_KEY_MISMATCH");
    const row=matching[0];
    code(Number.isSafeInteger(row.version)&&row.version>=2 &&
         digestRe.test(row.checksum||""),"QA106_RESUME_CHECKPOINT_INVALID");
    code(!Number.isFinite(Number(row.lease_until_ms)) ||
         Number(row.lease_until_ms)<=now,"QA106_RESUME_ACTIVE_LEASE");
    let state;
    try{state=JSON.parse(row.state_json);}catch{throw Error("QA106_RESUME_STATE_UNREADABLE");}
    const scope=state?.scopes?.[QA106_ROOT];
    const id=QA106_PDFS[slot], expectedFingerprint=expected[slot];
    code(state?.version===3&&
         Object.keys(state.scopes||{}).length===1&&
         scope?.files && Object.keys(scope.files).length===1&&
         Object.hasOwn(scope.files,id)&&
         scope.v2Files && Object.keys(scope.v2Files).length===1&&
         Object.hasOwn(scope.v2Files,id),
         "QA106_RESUME_CROSS_SCOPE_STATE");
    const rec=scope.v2Files[id];
    code(digestRe.test(expectedFingerprint||"")&&
         rec?.v2SourceFingerprint===expectedFingerprint&&
         rec.evidenceFingerprint===expectedFingerprint&&
         Array.isArray(rec.evidenceIds)&&rec.evidenceIds.length>=2&&
         rec.extractionQuality?.status==="text_layer_complete",
         "QA106_RESUME_EVIDENCE_NOT_DURABLE_OR_SOURCE_CHANGED");
    for(const key of ["rawFingerprint","mapFingerprint","publishedFingerprint",
                       "partialEvidenceFingerprint","partialRawFingerprint","partialMapFingerprint"]){
      if(rec[key]!=null)code(rec[key]===expectedFingerprint,
          "QA106_RESUME_REVISION_MISMATCH");
    }
    results.push({slot,version:row.version,evidence:true,
      raw:rec.rawFingerprint===expectedFingerprint,
      map:rec.mapFingerprint===expectedFingerprint,
      published:rec.publishedFingerprint===expectedFingerprint});
  }
  return results;
}
const b64=data=>Buffer.from(JSON.stringify(data)).toString("base64url");
async function getDriveFingerprints(){
  let account;
  try{account=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||"");}
  catch{throw Error("QA106_RESUME_GOOGLE_AUTH_MISSING");}
  code(account.type==="service_account"&&
       account.token_uri==="https://oauth2.googleapis.com/token"&&
       typeof account.client_email==="string"&&typeof account.private_key==="string",
       "QA106_RESUME_GOOGLE_AUTH_INVALID");
  const now=Math.floor(Date.now()/1000);
  const signing=b64({alg:"RS256",typ:"JWT"})+"."+b64({
    iss:account.client_email,
    scope:"https://www.googleapis.com/auth/drive.readonly",
    aud:account.token_uri,iat:now,exp:now+1200,
  });
  const sign=createSign("RSA-SHA256");
  sign.update(signing);sign.end();
  const response=await fetch(account.token_uri,{method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:signing+"."+sign.sign(account.private_key).toString("base64url")}),
    signal:AbortSignal.timeout(20000)});
  code(response.ok,"QA106_RESUME_GOOGLE_TOKEN_DENIED");
  const token=(await response.json()).access_token;
  code(typeof token==="string","QA106_RESUME_GOOGLE_TOKEN_MISSING");
  const expected={};
  for(const slot of allowedSlots){
    const id=QA106_PDFS[slot];
    const url="https://www.googleapis.com/drive/v3/files/"+id+
      "?fields=id,name,parents,mimeType,md5Checksum,modifiedTime,size,trashed";
    const r=await fetch(url,{headers:{Authorization:"Bearer "+token},
      signal:AbortSignal.timeout(20000)});
    code(r.ok,"QA106_RESUME_SOURCE_METADATA_DENIED");
    const f=await r.json();
    code(f.id===id&&f.mimeType==="application/pdf"&&
         Array.isArray(f.parents)&&f.parents.includes(QA106_ROOT)&&
         f.trashed!==true&&/^[a-f0-9]{32}$/i.test(f.md5Checksum||"")&&
         typeof f.name==="string"&&f.name.length>0,
         "QA106_RESUME_SOURCE_METADATA_CHANGED");
    expected[slot]=fingerprint({...f,sourcePath:f.name});
  }
  return expected;
}
async function main(){
  code(process.env.GITHUB_ACTIONS==="true"&&
       process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
       process.env.GITHUB_REF==="refs/heads/main"&&
       process.env.INGESTION_V2_QA_MODE==="true"&&
       process.env.QA106_CONFIRMATION===QA106_CONFIRM,
       "QA106_RESUME_NOT_APPROVED");
  const expected=await getDriveFingerprints();
  const keys=allowedSlots.map(qa106JobKey);
  const sql="SELECT c.job_key,c.version,c.checksum,c.state_json,"+
     "l.lease_until_ms FROM ingestion_worker_checkpoints c "+
     "LEFT JOIN ingestion_global_leases l ON l.job_key=c.job_key "+
     "WHERE c.job_key IN ('"+keys[0]+"','"+keys[1]+"');";
  let stdout;
  try{
    stdout=execFileSync("npx",[
      "wrangler","d1","execute","elevator-help-lease-test-01",
      "--remote","--config","wrangler.qa-pr100-v2.json",
      "--json","--command",sql
    ],{encoding:"utf8",maxBuffer:2*1024*1024,timeout:120000,
       stdio:["ignore","pipe","ignore"]});
  }catch{throw Error("QA106_RESUME_D1_READ_FAILED");}
  let data;
  try{data=JSON.parse(stdout);}catch{throw Error("QA106_RESUME_D1_INVALID_JSON");}
  const batches=Array.isArray(data)?data:[data];
  code(batches.length>=1 && batches.every(a=>Array.isArray(a.results)),
       "QA106_RESUME_D1_INVALID_RESULT");
  const rows=batches.flatMap(a=>a.results);
  const proof=verifyResumeRows(rows,expected);
  for(const rec of proof){
    console.log("PASS: Worker "+rec.slot+" source fingerprint unchanged, Evidence checkpoint durable, prior version="+rec.version+
      "; raw="+rec.raw+" map="+rec.map+" published="+rec.published);
  }
  console.log("QA106_TWO_D1_SOURCE_CHECKPOINTS_READONLY_RESUME_PASS");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{
    const marker=String(e?.message||"");
    console.error("::error::"+(/^QA106_[A-Z0-9_]+$/.test(marker)?
      marker:"QA106_RESUME_PREFLIGHT_FAILED"));
    process.exitCode=1;
  });
