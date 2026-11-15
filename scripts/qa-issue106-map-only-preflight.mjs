/**
 * Dedicated Issue106 map-only recovery gate. SELECT-only over isolated QA D1.
 * Does not print source data, IDs, fingerprints, private checkpoint JSON,
 * secrets, or model input. A failed gate never starts remote Workers.
 */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
import {buildQa106ReceiptSql,summarizeQa106Receipts} from "./qa-issue106-receipts-readonly.mjs";

const fail=(code)=>{throw Error(code)};
const slots=["A","B"];
const runSql=(sql)=>{
  let stdout;
  try{
    stdout=execFileSync("npx",["wrangler","d1","execute",
      "elevator-help-lease-test-01","--remote","--config",
      "wrangler.qa-pr100-v2.json","--json","--command",sql],{
        encoding:"utf8",maxBuffer:3*1024*1024,timeout:120000,
        stdio:["ignore","pipe","ignore"]});
  }catch{fail("QA106_MAP_ONLY_D1_READ_FAILED")}
  let data;
  try{data=JSON.parse(stdout)}catch{fail("QA106_MAP_ONLY_D1_JSON_INVALID")}
  const batches=Array.isArray(data)?data:[data];
  if(!batches.length||batches.some(b=>!Array.isArray(b.results)))
    fail("QA106_MAP_ONLY_D1_RESULT_INVALID");
  return batches.flatMap(b=>b.results);
};
const safeHash=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
export function verifyMapOnlyPreflight(checkpointRows,receiptRows,now=Date.now()){
  if(!Array.isArray(checkpointRows)||checkpointRows.length!==2)
    fail("QA106_MAP_ONLY_CHECKPOINT_ROWS_INVALID");
  const receipts=summarizeQa106Receipts(receiptRows);
  const results=[];
  for(const slot of slots){
    const matching=checkpointRows.filter(r=>r.job_key===qa106JobKey(slot));
    if(matching.length!==1)fail("QA106_MAP_ONLY_JOB_SCOPE_INVALID");
    const row=matching[0],proof=receipts.find(r=>r.slot===slot);
    if(Number.isFinite(Number(row.lease_until_ms))&&
       Number(row.lease_until_ms)>now)
      fail("QA106_MAP_ONLY_ACTIVE_WRITER");
    if(!Number.isSafeInteger(row.version)||row.version<2||!safeHash(row.checksum))
      fail("QA106_MAP_ONLY_CHECKPOINT_INVALID");
    let state;
    try{state=JSON.parse(row.state_json)}
    catch{fail("QA106_MAP_ONLY_CHECKPOINT_CORRUPT")}
    const scope=state?.scopes?.[QA106_ROOT],id=QA106_PDFS[slot];
    if(state?.version!==3||Object.keys(state.scopes||{}).length!==1||
       !scope?.files||Object.keys(scope.files).length!==1||
       !Object.hasOwn(scope.files,id)||
       !scope?.v2Files||Object.keys(scope.v2Files).length!==1||
       !Object.hasOwn(scope.v2Files,id))
      fail("QA106_MAP_ONLY_CROSS_SCOPE");
    const rec=scope.v2Files[id],fp=rec?.v2SourceFingerprint;
    if(!safeHash(fp)||rec.evidenceFingerprint!==fp||rec.rawFingerprint!==fp||
       rec.mapFingerprint===fp||rec.publishedFingerprint===fp||
       !Number.isSafeInteger(rec.documentEpoch)||rec.documentEpoch<1||
       !Array.isArray(rec.evidenceIds)||rec.evidenceIds.length<2||
       !Array.isArray(rec.ids)||rec.ids.length<2)
      fail("QA106_MAP_ONLY_NOT_PENDING_AT_MAP");
    if(!proof.epochPresent||proof.evidenceRows<2||proof.rawReceipts<2||
       proof.pendingMapWindows!==1||proof.published)
      fail("QA106_MAP_ONLY_RECEIPTS_INCOMPLETE");
    results.push({slot,checkpointVersion:row.version,
      evidence:proof.evidenceRows,raw:proof.rawReceipts,
      map:proof.mapReceipts,pending:proof.pendingMapWindows});
  }
  return results;
}
async function main(){
  if(process.env.GITHUB_ACTIONS!=="true"||
     process.env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     process.env.QA106_MAP_ONLY_CONFIRMATION!=="QA106_MAP_RECOVERY_NO_GEMINI")
    fail("QA106_MAP_ONLY_UNAPPROVED_CONTEXT");
  const keys=slots.map(qa106JobKey);
  const sql="SELECT c.job_key,c.version,c.checksum,c.state_json,"+
    "l.lease_until_ms FROM ingestion_worker_checkpoints c "+
    "LEFT JOIN ingestion_global_leases l ON l.job_key=c.job_key "+
    "WHERE c.job_key IN ('"+keys[0]+"','"+keys[1]+"');";
  const checkpoints=runSql(sql),receipts=runSql(buildQa106ReceiptSql());
  const valid=verifyMapOnlyPreflight(checkpoints,receipts);
  for(const entry of valid)
    console.log("PASS: QA Map-only worker "+entry.slot+
      " durable_version="+entry.checkpointVersion+
      " evidence="+entry.evidence+" raw="+entry.raw+
      " map_receipts="+entry.map+" pending_map_windows="+entry.pending);
  console.log("QA106_MAP_ONLY_PREFLIGHT_READONLY_PASS");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{
    const m=String(e?.message||"");
    console.error("::error::"+(/^QA106_MAP_ONLY_[A-Z0-9_]+$/.test(m)?
      m:"QA106_MAP_ONLY_PREFLIGHT_FAILED"));
    process.exitCode=1;
  });
