/**
 * Issue106: READ-ONLY inspection of authoritative QA D1 stage receipts.
 * No PDF data/IDs, vector IDs, source fingerprints, prompts or credentials are
 * emitted. This cannot infer provider-side billed Gemini calls or orphaned
 * Vectorize writes that never received a D1 receipt.
 */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";

const slots=["A","B"];
const safeId=id=>typeof id==="string" && /^[A-Za-z0-9_-]{12,90}$/.test(id);
const fail=code=>{throw Error(code);};

export function buildQa106ReceiptSql(){
  const queries=slots.map(slot=>{
    const id=QA106_PDFS[slot];
    const job=qa106JobKey(slot);
    if(!safeId(id)|| !/^drive:[A-Za-z0-9_-]{12,145}$/.test(job))
      fail("QA106_RECEIPTS_BAD_ALLOWLIST");
    const idSql="'"+id+"'";
    const current=(table,extra="")=>
      "(SELECT COUNT(*) FROM "+table+" r JOIN ingestion_v2_document_epochs e"+
      " ON e.document_id=r.document_id AND e.staging_epoch=r.generation"+
      " AND e.source_fingerprint=r.source_fingerprint"+
      " WHERE r.document_id="+idSql+extra+")";
    return "SELECT '"+slot+"' AS slot,"+
      "(SELECT COUNT(*) FROM ingestion_v2_document_epochs WHERE document_id="+idSql+
        " AND job_key='"+job+"') AS epoch_present,"+
      current("ingestion_v2_staged_evidence")+" AS evidence_current,"+
      current("ingestion_v2_vector_receipts"," AND r.layer='raw'")+" AS raw_current,"+
      current("ingestion_v2_vector_receipts"," AND r.layer='map'")+" AS map_current,"+
      "(SELECT COUNT(*) FROM ingestion_v2_vector_receipts WHERE document_id="+idSql+
        " AND layer='raw') AS raw_all_epochs,"+
      "(SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id="+idSql+
        " AND job_key='"+job+"') AS published_count";
  });
  return queries.join(" UNION ALL ")+";";
}
const bounded=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0&&Number(v)<=1000000?
 Number(v):null;
export function summarizeQa106Receipts(rows){
  if(!Array.isArray(rows)||rows.length!==2 ||
    new Set(rows.map(r=>r.slot)).size!==2 ||
    rows.some(r=>!slots.includes(r.slot)))fail("QA106_RECEIPTS_UNEXPECTED_ROWS");
  return slots.map(slot=>{
    const r=rows.find(x=>x.slot===slot);
    const fields=["epoch_present","evidence_current","raw_current","map_current",
      "raw_all_epochs","published_count"];
    const vals=Object.fromEntries(fields.map(k=>[k,bounded(r?.[k])]));
    if(fields.some(k=>vals[k]===null))fail("QA106_RECEIPTS_INVALID_COUNTS");
    return {slot,epochPresent:vals.epoch_present===1,
      evidenceRows:vals.evidence_current,rawReceipts:vals.raw_current,
      mapReceipts:vals.map_current,
      rawReceiptsAcrossEpochs:vals.raw_all_epochs,
      published:vals.published_count===1,
      anyOrphanedOldRaw:vals.raw_all_epochs>vals.raw_current};
  });
}
async function main(){
  if(process.env.GITHUB_ACTIONS!=="true" ||
    process.env.GITHUB_REF!=="refs/heads/main" ||
    process.env.GITHUB_EVENT_NAME!=="push")
    fail("QA106_RECEIPTS_UNAPPROVED_CONTEXT");
  let stdout;
  try{
    stdout=execFileSync("npx",["wrangler","d1","execute",
      "elevator-help-lease-test-01","--remote","--config",
      "wrangler.qa-pr100-v2.json","--json","--command",
      buildQa106ReceiptSql()],{
        encoding:"utf8",timeout:120000,maxBuffer:1024*1024,
        stdio:["ignore","pipe","ignore"]});
  }catch{fail("QA106_RECEIPTS_REMOTE_D1_FAILED");}
  let raw;
  try{raw=JSON.parse(stdout);}catch{fail("QA106_RECEIPTS_INVALID_JSON");}
  const batches=Array.isArray(raw)?raw:[raw];
  if(batches.some(b=>!Array.isArray(b.results)))fail("QA106_RECEIPTS_INVALID_RESPONSE");
  const summaries=summarizeQa106Receipts(batches.flatMap(b=>b.results));
  for(const rec of summaries){
    console.log("QA106_RECEIPTS_"+rec.slot+
      " epoch_present="+rec.epochPresent+
      " evidence_staged="+rec.evidenceRows+
      " raw_current="+rec.rawReceipts+
      " map_current="+rec.mapReceipts+
      " raw_all_epochs="+rec.rawReceiptsAcrossEpochs+
      " orphaned_old_raw="+rec.anyOrphanedOldRaw+
      " published="+rec.published);
  }
  console.log("QA106_RECEIPTS_READONLY_PASS");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{
    const marker=String(e?.message||"");
    console.error("::error::"+(/^QA106_RECEIPTS_[A-Z0-9_]+$/.test(marker)?
      marker:"QA106_RECEIPTS_UNKNOWN_ERROR"));
    process.exitCode=1;
 });
