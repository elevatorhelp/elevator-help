/**
 * No-model QA remote proof: existing real-Drive Map receipts are replayed as
 * a synthetic pending intent. Only isolated QA D1 and two QA Vectorize indexes.
 * No Gemini key, Drive access, secret output, raw vectors, or production writes.
 */
import {execFileSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {immutableMapWindowKey} from "../app/lib/ingestion-v2-map-reconciliation.ts";
const ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const FILE="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const JOB="drive:"+ROOT;
const run=process.env.GITHUB_RUN_ID||"";
const token=process.env.QA_V2_INGESTION_TOKEN;
const owner="gh-"+run+"-"+randomBytes(12).toString("hex");
let lease=null;
const check=(v,c)=>{if(!v)throw Error(c);};
function d1(cmd){
  let s;
  try{s=execFileSync("npx",["wrangler","d1","execute","elevator-help-lease-test-01",
    "--remote","--config","wrangler.qa-pr100-v2.json","--json","--command",cmd],
    {encoding:"utf8",timeout:90000,stdio:["ignore","pipe","pipe"]});}
  catch{throw Error("QA104_ISOLATED_D1_QUERY_FAILED");}
  let v;try{v=JSON.parse(s);}catch{throw Error("QA104_D1_JSON_INVALID");}
  return (Array.isArray(v)?v:[v]).flatMap(x=>x?.results||[]);
}
async function post(path,body,expect=true){
  const response=await fetch("http://127.0.0.1:8787/api/"+path,{
    method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.timeout(25000)
  });
  const data=await response.json().catch(()=>null);
  check(expect?response.ok&&data?.ok===true:!response.ok&&data?.ok!==true,
    "QA104_UNEXPECTED_REMOTE_HTTP_RESULT");
  return data;
}
const coord=(action,body={})=>post("ingestion-coordinator",{action,jobKey:JOB,...body});
async function main(){
  check(process.env.GITHUB_ACTIONS==="true"&&
    process.env.GITHUB_EVENT_NAME==="push"&&
    process.env.GITHUB_REF==="refs/heads/qa/issue104-remote-reconcile-20261115"&&
    /^[1-9][0-9]{5,19}$/.test(run)&&process.env.QA_V2_JOB_KEY===JOB&&
    typeof token==="string"&&token.length>=24,"QA104_UNAPPROVED_CONTEXT");
  const query=`SELECT e.staging_epoch AS epoch,e.source_fingerprint AS fingerprint,
     r.logical_id AS logicalId,r.staged_id AS stagedId
     FROM ingestion_v2_document_epochs e
     JOIN ingestion_v2_vector_receipts r
       ON r.document_id=e.document_id AND r.generation=e.staging_epoch
       AND r.source_fingerprint=e.source_fingerprint
     JOIN ingestion_v2_publications p
       ON p.document_id=e.document_id AND p.active_generation=e.staging_epoch
       AND p.source_fingerprint=e.source_fingerprint
     WHERE e.document_id='__FILE__' AND e.job_key='__JOB__'
       AND r.layer='map' ORDER BY r.logical_id`
    .replace("__FILE__",FILE).replace("__JOB__",JOB);
  const rows=d1(query);
  check(rows.length===2,"QA104_EXPECTED_TWO_PUBLISHED_MAP_ROWS");
  const epoch=Number(rows[0].epoch),fp=rows[0].fingerprint;
  check(Number.isSafeInteger(epoch)&&epoch>=1&&/^[a-f0-9]{64}$/.test(fp)&&
    rows.every(x=>Number(x.epoch)===epoch&&x.fingerprint===fp&&
      /^map-[a-f0-9]{40}$/.test(x.logicalId)&&
      /^v2m-[1-9a-z][a-z0-9]*-[a-f0-9]{40}$/.test(x.stagedId))&&
    new Set(rows.map(x=>x.stagedId)).size===2,
    "QA104_PUBLISHED_VECTOR_IDS_NOT_VALID");
  const document={sourceFileId:FILE,sourceFingerprint:fp,mapVersion:4,
    fileName:"synthetic.pdf",sourcePath:"QA-only/synthetic.pdf"};
  const pages=[
    {page:1,text:"QA-4711 synthetic readback "+run},
    {page:2,text:"MOCK-DOOR-12 synthetic readback "+run},
  ];
  const windowKey=immutableMapWindowKey(FILE,fp,4,pages);
  const ids=JSON.stringify(rows.map(x=>({logicalId:x.logicalId,stagedId:x.stagedId})));
  check(/^[a-zA-Z0-9_":,{}\[\]-]+$/.test(ids),
    "QA104_UNSAFE_TEST_IDS_JSON");
  d1(`INSERT INTO ingestion_v2_pending_map_windows
       (document_id,job_key,generation,source_fingerprint,window_key,
        map_version,ids_json,created_at_ms)
       VALUES ('__FILE__','__JOB__',__EPOCH__,'__FP__','__KEY__',4,'__IDS__',__NOW__)`
    .replace("__FILE__",FILE).replace("__JOB__",JOB)
    .replace("__EPOCH__",String(epoch)).replace("__FP__",fp)
    .replace("__KEY__",windowKey).replace("__IDS__",ids)
    .replace("__NOW__",String(Date.now())));
  console.log("PASS: seeded synthetic no-Gemini QA Map intent from existing published vectors");
  const claimed=await coord("claim",{owner,ttlMs:180000});
  lease=claimed.lease;
  check(lease?.jobKey===JOB&&lease.owner===owner,"QA104_LEASE_NOT_GRANTED");
  const recovered=await post("document-map-ingest",{
    action:"reconcile_map_v2",document,pages,globalArchiveLease:lease});
  check(recovered.status==="complete"&&recovered.recovered===true&&
    recovered.staged===true&&recovered.published===false&&
    recovered.mapCount===2&&recovered.documentEpoch===epoch&&
    JSON.stringify(recovered.stagedIds)===
      JSON.stringify(rows.map(x=>x.stagedId)),
    "QA104_REMOTE_REAL_MAP_READBACK_MISMATCH");
  console.log("PASS: actual remote QA Worker recovered exact Map receipts WITHOUT Gemini");
  const different=await post("document-map-ingest",{
    action:"reconcile_map_v2",document,globalArchiveLease:lease,
    pages:[{page:1,text:pages[0].text+"changed"},pages[1]]});
  check(different.status==="none"&&different.recovered===false,
    "QA104_DIFFERENT_WINDOW_REUSED_PAID_INTENT");
  console.log("PASS: unrelated source window does not reuse Map intent");
  await coord("release",{lease});
  await post("document-map-ingest",{
    action:"reconcile_map_v2",document,pages,globalArchiveLease:lease},false);
  lease=null;
  console.log("PASS: stale lease denied for Map reconciliation");
  console.log("QA104_REMOTE_NO_GEMINI_RECONCILIATION_PASS");
}
try{await main();}
catch(e){
  const c=String(e?.message||"");
  console.error("::error::"+(/^QA104_[A-Z0-9_]+$/.test(c)?c:"QA104_REMOTE_ABORTED"));
  process.exitCode=1;
}finally{
  if(lease){try{await coord("release",{lease});}catch{}}
}
