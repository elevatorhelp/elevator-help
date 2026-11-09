/**
 * PR100: actual HTTP routes on a real, isolated Cloudflare QA Worker.
 * One synthetic document, no Google Drive, no private PDFs, no Gemini calls.
 * This closes physical HTTP/D1/Vectorize boundary only, NOT Drive PDF E2E.
 */
import {randomBytes} from "node:crypto";
import {extractQaTwoPagePdf} from "./qa-pr100-pdf-fixture.mjs";
import {writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";

const run=process.env.GITHUB_RUN_ID || "";
const attempt=process.env.GITHUB_RUN_ATTEMPT || "1";
const base="http://127.0.0.1:8787";
const token=process.env.QA_V2_INGESTION_TOKEN;
const root=process.env.QA_V2_JOB_KEY;
const reportDir=process.env.RUNNER_TEMP || ".";
const reportFile=join(reportDir,"qa-pr100-real-http.json");
const report={schema:1,run,attempt,scope:"isolated-cloudflare-qa",
  physicalWorker:true,realPdfExtraction:false,realDrivePdf:false,geminiCalls:0,productionChanged:false,
  checks:[],status:"RUNNING"};
function persist(){
  mkdirSync(reportDir,{recursive:true});
  writeFileSync(reportFile,JSON.stringify(report,null,2)+"\n",{mode:0o600});
}
function record(name,passed){
  report.checks.push({name,status:passed?"PASS":"FAIL"});
  console.log((passed?"PASS":"FAIL")+": "+name);
  if(!passed)throw Error("QA_GATE_FAILED");
}
function safeCode(body,status){
  const code=body?.error;
  return typeof code==="string"&&/^[A-Z_0-9]{4,95}$/.test(code)
    ? code : "HTTP_"+status;
}
async function request(route,data,expected=200){
  let response;
  try{
    response=await fetch(base+route,{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,
        "Content-Type":"application/json"},
      body:JSON.stringify(data),
      signal:AbortSignal.timeout(27000)
    });
  }catch{throw Error("QA_ROUTE_TRANSPORT_UNAVAILABLE");}
  let body;
  try{body=await response.json();}
  catch{throw Error("QA_ROUTE_INVALID_JSON");}
  if(response.status!==expected ||
     (expected===200 && body?.ok!==true)){
    throw Error("QA_ROUTE_"+safeCode(body,response.status));
  }
  return body;
}
async function wait(ms){return new Promise(r=>setTimeout(r,ms));}
const jobKey=root;
const doc="qa-pr100-"+run;
const fp="fixture-revision-"+run+"-"+attempt;
const owner="gh-"+run+"-"+randomBytes(12).toString("hex");
const vectors=[
  {id:"raw1",layer:"raw",logicalId:"qa-raw-1-"+run,
    metadata:{sourceFileId:doc,sourceFingerprint:fp,
      text:"Synthetic QA PDF page one.",fileName:"qa-fixture.pdf",
      sourcePath:"qa-only/fixture.pdf",page:1,chunkIndex:0,
      status:"active",contentType:"general"}},
  {id:"raw2",layer:"raw",logicalId:"qa-raw-2-"+run,
    metadata:{sourceFileId:doc,sourceFingerprint:fp,
      text:"Synthetic QA PDF page two.",fileName:"qa-fixture.pdf",
      sourcePath:"qa-only/fixture.pdf",page:2,chunkIndex:0,
      status:"active",contentType:"general"}},
  {id:"map",layer:"map",logicalId:"qa-map-"+run,
    metadata:{sourceFileId:doc,sourceFingerprint:fp,
      text:"Synthetic two-page QA source map.",fileName:"qa-fixture.pdf",
      sourcePath:"qa-only/fixture.pdf",page:1,pageEnd:2,
      chunkIndex:-1,status:"active",contentType:"document-map"}}
];
const values=idx=>Array.from({length:768},(_,i)=>i===idx?1:0);
let lease;
let stageEpoch;
let released=false;
async function coord(action,other={},status=200){
  return request("/api/ingestion-coordinator",{
    action,jobKey,...other
  },status);
}
async function stageVector(item,idx){
  const recordPayload={
    logicalId:item.logicalId,sourceFingerprint:fp,
    metadata:item.metadata,
    legacyValues:values(idx),multilingualValues:values(idx)
  };
  // Real Vectorize getByIds is eventually consistent. The route refuses to
  // create a receipt before BOTH physical indexes return the matching data.
  for(let step=0;step<16;step++){
    await coord("renew",{lease,ttlMs:180000});
    try{
      return await request("/api/immutable-archive-publish",{
        action:"stage_vector",documentId:doc,
        layer:item.layer,record:recordPayload,globalArchiveLease:lease
      });
    }catch(error){
      const label=error?.message;
      if(label!=="QA_ROUTE_STAGED_DUAL_VECTOR_READBACK_NOT_READY" &&
         label!=="QA_ROUTE_STAGED_VECTOR_RECEIPT_DENIED")
        throw error;
      await wait(4500);
    }
  }
  throw Error("QA_VECTORIZE_READBACK_RETRIES_EXHAUSTED");
}
async function main(){
  if(!/^[1-9][0-9]{5,19}$/.test(run) ||
     !/^[1-9][0-9]{0,4}$/.test(attempt)||
     typeof token!=="string"||token.length<24||
     jobKey!=="drive:QaFixtureRoot_"+run)
    throw Error("QA_INVALID_EXECUTION_CONTEXT");

  // This is the same unpdf parser used in scripts/drive-ingest.mjs.
  const pages=await extractQaTwoPagePdf();
  report.realPdfExtraction=true;
  record("real two-page PDF text extraction",
    pages.length===2&&pages[0].includes("1.2.3")&&pages[1].includes("1.2.4"));
  vectors[0].metadata.text=pages[0];
  vectors[1].metadata.text=pages[1];
  vectors[2].metadata.text="Synthetic section map: "+pages.join(" | ");

  const response=await coord("claim",{owner,ttlMs:180000});
  lease=response.lease;
  record("exclusive D1 root lease",lease?.owner===owner&&lease.jobKey===jobKey);

  const evidenceIds=[];
  for(let i=0;i<pages.length;i++){
    const evidenceId="qa-evidence-"+run+"-page-"+(i+1);
    const evidence=await request("/api/immutable-archive-publish",{
      action:"stage_evidence",documentId:doc,globalArchiveLease:lease,
      evidence:{
        logicalId:evidenceId,sourceFingerprint:fp,text:pages[i],
        fileName:"qa-fixture.pdf",sourcePath:"qa-only/fixture.pdf",
        page:i+1,chunkIndex:0
      }
    });
    if(stageEpoch===undefined)stageEpoch=evidence.documentEpoch;
    record("immutable PDF Evidence page "+(i+1)+" staged",
      evidence.staged===true&&evidence.documentEpoch===stageEpoch&&
      Number.isSafeInteger(stageEpoch)&&stageEpoch>=1);
    evidenceIds.push(evidenceId);
  }

  const fakeManifest={
    sourceFingerprint:fp,evidenceIds,
    rawIds:["not-staged-raw"],mapIds:["not-staged-map"]
  };
  const incomplete=await request("/api/immutable-archive-publish",{
    action:"publish",documentId:doc,globalArchiveLease:lease,
    manifest:fakeManifest
  },409);
  record("incomplete generation cannot publish",
    incomplete.error==="INCOMPLETE_OR_STALE_PUBLICATION");

  const rawIds=[];
  for(let i=0;i<2;i++){
    const raw=await stageVector(vectors[i],i);
    record("PDF page "+(i+1)+" RAW dual-index readback",
      raw.staged===true&&raw.published===false&&
      raw.documentEpoch===stageEpoch&&/^v2r-[1-9a-z]+-[a-f0-9]{40}$/.test(raw.stagedId));
    rawIds.push(raw.stagedId);
  }
  const map=await stageVector(vectors[2],2);
  record("two-page Map dual-index readback",
    map.staged===true&&map.published===false&&
    map.documentEpoch===stageEpoch&&/^v2m-[1-9a-z]+-[a-f0-9]{40}$/.test(map.stagedId));

  const manifest={
    sourceFingerprint:fp,evidenceIds,
    rawIds,mapIds:[map.stagedId]
  };
  const publish=await request("/api/immutable-archive-publish",{
    action:"publish",documentId:doc,manifest,globalArchiveLease:lease
  });
  record("D1 atomic three-layer publish",
    publish.published===true&&publish.generation===stageEpoch);

  const attest=await request("/api/immutable-archive-publish",{
    action:"verify_published",documentId:doc,
    manifest,globalArchiveLease:lease
  });
  record("exact manifest read-only attestation",
    attest.published===true&&attest.generation===stageEpoch);

  // Never permit a second commit to overwrite same revision.
  const duplicate=await request("/api/immutable-archive-publish",{
    action:"publish",documentId:doc,manifest,globalArchiveLease:lease
  },409);
  record("duplicate CAS is rejected",
    duplicate.error==="INCOMPLETE_OR_STALE_PUBLICATION");

  await coord("release",{lease});
  released=true;
  const stale=await request("/api/immutable-archive-publish",{
    action:"publish",documentId:doc,manifest,globalArchiveLease:lease
  },409);
  record("expired or released owner cannot publish",
    ["GLOBAL_ARCHIVE_LEASE_STALE","INCOMPLETE_OR_STALE_PUBLICATION"].includes(stale.error));
}
try{await main();report.status="PASS";}
catch(error){
  report.status="FAIL";
  report.error=typeof error?.message==="string"&&
    /^QA_[A-Z0-9_]{4,100}$/.test(error.message)
    ?error.message:"QA_HTTP_INTEGRATION_FAILED";
  console.error(report.error);
  process.exitCode=1;
}finally{
  if(lease&&!released){
    try{await coord("release",{lease});}catch{/* root lease expires */}
  }
  persist();
}
