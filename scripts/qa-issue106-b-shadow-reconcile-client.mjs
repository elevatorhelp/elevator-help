/**
 * Issue106: zero-model recovery of a durably embedded B Shadow Map.
 * Invoked ONLY by an owner-approved GitHub Actions job on the QA-only branch.
 * The remote worker is isolated; source PDF checked against the exact Drive
 * folder and MD5 before any call. No Production endpoint or /api/ask.
 * All API responses/logs are reduced to audited marker enums.
 */
import {createSign,createHash} from "node:crypto";
import {getDocumentProxy,extractText} from "unpdf";
import {fingerprint} from "./drive-ingest.mjs";
import {QA106_ROOT,QA106_PDFS,QA106_CONFIRM,qa106JobKey}
 from "./qa-issue106-parallel-guard.mjs";

const STOP="QA106_B_SHADOW_";
const deny=(code)=>{throw Error(STOP+code);};
const fileId=QA106_PDFS.B;
const jobKey=qa106JobKey("B");
const url="http://127.0.0.1:8788";
const token=process.env.QA_V2_INGESTION_TOKEN;
const signBase64=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
function gate(){
 if(process.env.GITHUB_ACTIONS!=="true"||
    process.env.GITHUB_EVENT_NAME!=="push"||
    process.env.GITHUB_REF!=="refs/heads/feat/issue106-shadow-map-revision-20261122"||
    process.env.QA106_B_SHADOW_CONFIRMATION!=="QA106_B_SHADOW_RECOVERY_NO_MODEL"||
    process.env.MAX_GEMINI_CALLS!=="0" ||
    process.env.GEMINI_API_KEY!==undefined ||
    process.env.GEMINI_BENCHMARK_API_KEY!==undefined ||
    process.env.INGESTION_V2_QA_MODE!=="true"||
    process.env.QA106_CONFIRMATION!==QA106_CONFIRM||
    !/^[1-9][0-9]{5,19}$/.test(process.env.GITHUB_RUN_ID||"")||
    typeof token!=="string"||token.length<24||
    process.env.INGESTION_V2_QA_ORIGIN!==url||
    process.env.DRIVE_FOLDER_ID!==QA106_ROOT||
    process.env.QA_V2_JOB_KEY!==jobKey)
   deny("CONTEXT_DENIED");
}
async function googleToken(){
 let a;try{a=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||"");}
 catch{deny("GOOGLE_CREDENTIAL_UNAVAILABLE");}
 if(a?.type!=="service_account"||
   a.token_uri!=="https://oauth2.googleapis.com/token"||
   typeof a.client_email!=="string"||typeof a.private_key!=="string")
   deny("GOOGLE_CREDENTIAL_INVALID");
 const now=Math.floor(Date.now()/1000);
 const prefix=signBase64({alg:"RS256",typ:"JWT"})+"."+
  signBase64({iss:a.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",
    aud:a.token_uri,iat:now,exp:now+1200});
 const s=createSign("RSA-SHA256");s.update(prefix);s.end();
 const response=await fetch(a.token_uri,{method:"POST",
   headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
     assertion:prefix+"."+s.sign(a.private_key).toString("base64url")}),
   signal:AbortSignal.timeout(20000)});
 if(!response.ok)deny("GOOGLE_TOKEN_REJECTED");
 const out=await response.json();
 if(typeof out.access_token!=="string")deny("GOOGLE_TOKEN_MISSING");
 return out.access_token;
}
async function sourcePages(access){
 const p="https://www.googleapis.com/drive/v3/files/"+fileId;
 const metadata=await fetch(p+
  "?fields=id,name,mimeType,parents,md5Checksum,modifiedTime,trashed,size",
  {headers:{Authorization:"Bearer "+access},signal:AbortSignal.timeout(20000)});
 if(!metadata.ok)deny("SOURCE_METADATA_UNAVAILABLE");
 const doc=await metadata.json();
 if(doc.id!==fileId||doc.mimeType!=="application/pdf"||
   doc.trashed===true||!doc.parents?.includes(QA106_ROOT)||
   !/^[a-f0-9]{32}$/i.test(doc.md5Checksum||"")||
   typeof doc.name!=="string"||!doc.name)
   deny("SOURCE_IDENTITY_CHANGED");
 const response=await fetch(p+"?alt=media",
   {headers:{Authorization:"Bearer "+access},signal:AbortSignal.timeout(30000)});
 if(!response.ok)deny("SOURCE_READ_DENIED");
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<100||bytes.length>2_000_000||
   createHash("md5").update(bytes).digest("hex").toLowerCase()!==
   doc.md5Checksum.toLowerCase())deny("SOURCE_CHECKSUM_CHANGED");
 const pdf=await getDocumentProxy(bytes);
 const extracted=await extractText(pdf,{mergePages:false});
 if(extracted.totalPages!==2||!Array.isArray(extracted.text)||
   extracted.text.length!==2)deny("SOURCE_PAGE_COUNT_CHANGED");
 const pages=extracted.text.map((text,i)=>({page:i+1,text:String(text||"").slice(0,7000)}));
 if(pages.some(p=>p.text.trim().length<20))deny("SOURCE_TEXT_INCOMPLETE");
 const document={sourceFileId:fileId,fileName:doc.name,sourcePath:doc.name,
   mapVersion:4,modifiedTime:doc.modifiedTime,
   sourceFingerprint:fingerprint({...doc,sourcePath:doc.name})};
 if(!/^[a-f0-9]{64}$/.test(document.sourceFingerprint))
   deny("SOURCE_FINGERPRINT_INVALID");
 return {document,pages};
}
async function post(path,body,ms=15000){
 let resp;
 try{resp=await fetch(url+path,{method:"POST",
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify(body),signal:AbortSignal.timeout(ms)});}
 catch{deny("QA_WORKER_TRANSPORT_FAILURE");}
 let data;try{data=await resp.json();}catch{deny("QA_WORKER_BAD_RESPONSE");}
 if(!resp.ok||data?.ok===false){
   const code=String(data?.error||"");
   if(/^(?:QA106_B_SHADOW_|QA106_MAP_REVISION_|V2_MAP_|ARCHIVE_)[A-Z0-9_]{3,100}$/.test(code))
     throw Error(code);
   deny("QA_WORKER_REJECTED");
 }
 return data;
}
async function main(){
 gate();
 // Source MUST be re-read from the exact Drive B PDF before any provider
 // reservation. No cached input, no supplied synthetic prompt.
 const source=await sourcePages(await googleToken());
 const owner="gh-"+process.env.GITHUB_RUN_ID+"-"+
  createHash("sha256").update(process.env.GITHUB_RUN_ID+":B-shadow").digest("hex").slice(0,24);
 const claim=await post("/api/ingestion-coordinator",
   {action:"claim",jobKey,owner,ttlMs:180000});
 const lease=claim.lease;
 if(!lease||lease.jobKey!==jobKey||lease.owner!==owner||
   !Number.isSafeInteger(lease.generation)||lease.generation<1)
   deny("LEASE_INVALID");
 let leaseLost=false,active=true,busy=false;
 const timer=setInterval(async()=>{
   if(!active||busy)return;
   busy=true;
   try{
     const result=await post("/api/ingestion-coordinator",
       {action:"renew",jobKey,lease,ttlMs:180000});
     if(result?.ok!==true)leaseLost=true;
   }catch{leaseLost=true;}finally{busy=false;}
 },45000);
 timer.unref?.();
 try{
   let answer=await post("/api/document-map-ingest",
      {action:"reconcile_qa106_shadow_map_b_v2",document:source.document,
        pages:source.pages,globalArchiveLease:lease},180000);
   // ONLY a pending physical Vectorize readback permits a model-free
   // retry. Generation/embeddings have already been made durable on D1.
   for(let i=0;i<5&&answer.status==="pending";i++){
     if(leaseLost)deny("LEASE_LOST");
     await new Promise(r=>setTimeout(r,8000));
     answer=await post("/api/document-map-ingest",
      {action:"reconcile_qa106_shadow_map_b_v2",document:source.document,
        pages:source.pages,globalArchiveLease:lease},180000);
   }
   if(leaseLost||answer?.shadowOnly!==true||
     answer?.published!==false||answer?.providerCalls!==0||
     answer?.status!=="shadow_published")
     deny("SHADOW_PUBLICATION_NOT_VERIFIED");
   console.log("PASS:QA106_B_SHADOW_DURABLE_MODEL_FREE_RECONCILED");
   console.log("PASS:QA106_B_SHADOW_DUAL_INDEX_NO_EXTRA_GEMINI");
 }finally{
   active=false;clearInterval(timer);
   if(!leaseLost){
     try{await post("/api/ingestion-coordinator",
       {action:"release",jobKey,lease},15000);}
     catch{/* Lease expires without handing ownership to stale workers. */}
   }
 }
}
main().catch(e=>{
 const code=String(e?.message||"");
 console.error("::error::"+
   (/^(?:QA106_B_SHADOW_|QA106_MAP_REVISION_|V2_MAP_|ARCHIVE_)[A-Z0-9_]{3,100}$/.test(code)?
    code:"QA106_B_SHADOW_SAFE_ABORT"));
 process.exitCode=1;
});
