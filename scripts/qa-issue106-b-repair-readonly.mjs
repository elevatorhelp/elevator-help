/**
 * Before any paid calls, prove the exact two-PDF QA state: A already immutable
 * published; B RAW/Evidence complete but exactly one of two Map receipts missing.
 * Isolated QA D1 SELECTs only; never print document IDs/checkpoint JSON.
 */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {QA106_ROOT,QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
import {buildQa106ReceiptSql,summarizeQa106Receipts}
  from "./qa-issue106-receipts-readonly.mjs";
const fail=code=>{throw Error(code)};
const sha=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const slots=["A","B"];
export function verifyBRepairReadOnly(checkpoints,receipts,now=Date.now()){
  if(!Array.isArray(checkpoints)||checkpoints.length!==2)
    fail("QA106_B_REPAIR_CHECKPOINTS_MISSING");
  const proof=summarizeQa106Receipts(receipts);
  const out=[];
  for(const slot of slots){
    const matching=checkpoints.filter(x=>x.job_key===qa106JobKey(slot));
    if(matching.length!==1)fail("QA106_B_REPAIR_SCOPE_MISMATCH");
    const r=matching[0],p=proof.find(x=>x.slot===slot);
    if(Number.isFinite(Number(r.lease_until_ms))&&
       Number(r.lease_until_ms)>now)
      fail("QA106_B_REPAIR_ACTIVE_LEASE");
    if(!Number.isSafeInteger(r.version)||r.version<2||!sha(r.checksum))
      fail("QA106_B_REPAIR_CHECKPOINT_CORRUPT");
    let state;
    try{state=JSON.parse(r.state_json)}
    catch{fail("QA106_B_REPAIR_CHECKPOINT_CORRUPT")}
    const root=state?.scopes?.[QA106_ROOT],id=QA106_PDFS[slot];
    if(state?.version!==3||Object.keys(state.scopes||{}).length!==1||
       !root?.files||Object.keys(root.files).length!==1||
       !Object.hasOwn(root.files,id)||!root.v2Files||
       Object.keys(root.v2Files).length!==1||
       !Object.hasOwn(root.v2Files,id))
      fail("QA106_B_REPAIR_CROSS_SCOPE");
    const rec=root.v2Files[id],fp=rec.v2SourceFingerprint;
    if(!sha(fp)||rec.evidenceFingerprint!==fp||rec.rawFingerprint!==fp||
       !Number.isSafeInteger(rec.documentEpoch)||rec.documentEpoch<1||
       !p.epochPresent||p.evidenceRows!==2||p.rawReceipts!==2)
      fail("QA106_B_REPAIR_RAW_EVIDENCE_NOT_COMPLETE");
    if(slot==="A"){
      if(rec.mapFingerprint!==fp||rec.publishedFingerprint!==fp||
         rec.publishedEpoch!==rec.documentEpoch||
         p.mapReceipts!==2||p.published!==true)
        fail("QA106_B_REPAIR_A_NOT_PUBLISHED");
    }else if(rec.mapFingerprint===fp||rec.publishedFingerprint===fp||
        p.mapReceipts!==1||p.pendingMapWindows!==1||p.published!==false)
        fail("QA106_B_REPAIR_B_NOT_EXACTLY_ONE_MISSING");
    out.push({slot,version:r.version,mapReceipts:p.mapReceipts,published:p.published});
  }
  return out;
}
function d1(sql){
  let txt;
  try{
    txt=execFileSync("npx",["wrangler","d1","execute",
      "elevator-help-lease-test-01","--remote","--config",
      "wrangler.qa-pr100-v2.json","--json","--command",sql],
      {encoding:"utf8",maxBuffer:2*1024*1024,timeout:120000,
      stdio:["ignore","pipe","ignore"]});
  }catch{fail("QA106_B_REPAIR_D1_UNAVAILABLE")}
  let raw;
  try{raw=JSON.parse(txt)}catch{fail("QA106_B_REPAIR_D1_RESULT_INVALID")}
  const batches=Array.isArray(raw)?raw:[raw];
  if(!batches.length||batches.some(x=>!Array.isArray(x.results)))
    fail("QA106_B_REPAIR_D1_RESULT_INVALID");
  return batches.flatMap(x=>x.results);
}
async function main(){
  if(process.env.GITHUB_ACTIONS!=="true"||
     process.env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     process.env.QA106_B_MAP_REPAIR_CONFIRMATION!=="QA106_B_ONLY_MAX_4_GEMINI_CALLS")
    fail("QA106_B_REPAIR_CONTEXT_DENIED");
  const k=slots.map(qa106JobKey);
  const q="SELECT c.job_key,c.version,c.checksum,c.state_json,l.lease_until_ms "+
    "FROM ingestion_worker_checkpoints c LEFT JOIN ingestion_global_leases l "+
    "ON c.job_key=l.job_key WHERE c.job_key IN ('"+k[0]+"','"+k[1]+"');";
  const validated=verifyBRepairReadOnly(d1(q),d1(buildQa106ReceiptSql()));
  for(const result of validated)
    console.log("PASS: QA B repair preflight "+result.slot+
      " published="+result.published+" map_receipts="+result.mapReceipts+
      " checkpoint_version="+result.version);
  console.log("QA106_B_ONLY_EXACT_MAP_PREPAY_READONLY_PASS");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(e=>{
    const m=String(e?.message||"");
    console.error("::error::"+(/^QA106_B_REPAIR_[A-Z0-9_]+$/.test(m)?
      m:"QA106_B_REPAIR_PREFLIGHT_FAILED"));
    process.exitCode=1;
  });
