/**
 * Issue #106: exact, bounded, QA-only repair guard for the single missing Map
 * node in PDF B. Check BEFORE paid generation, and recheck exact 160-bit
 * semantic node IDs AFTER generation but BEFORE embedding or vector insert.
 *
 * Missing original model output is unrecoverable from an ID hash alone.
 * Never invent a replacement text for an old ID or change the manifest.
 * If temperature=0 regeneration is not byte-for-byte identical for BOTH
 * original nodes, fail closed with zero vector or D1 writes.
 */
import {
  immutableVectorId, type ImmutableIndex,
} from "./ingestion-immutable-publication.ts";
import {
  validateArchiveLease, type ArchiveLease, type CoordinatorDB,
} from "./ingestion-global-coordinator.ts";
import {validateStagingEpoch} from "./ingestion-document-staging-epoch.ts";

export const QA106_B_PDF_ID="1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn";
export const QA106_A_PDF_ID="1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v";
export const QA106_B_JOB="drive:1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC_qa_B";
export const QA106_A_JOB="drive:1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC_qa_A";

const sha=/^[a-f0-9]{64}$/;
const logical=/^map-[a-f0-9]{40}$/;
const physical=/^v2m-[1-9a-z][0-9a-z]*-[a-f0-9]{40}$/;
const abort=(kind:string):never=>{throw Error("QA106_B_REPAIR_"+kind)};

type Receipt={logical_id:unknown;staged_id:unknown;source_fingerprint:unknown};
type Entry={logicalId:string;stagedId:string};
export type ExactRepairPlan={
  entries:Entry[];missingLogicalId:string;missingPhysicalId:string;
  documentEpoch:number;
};
function goodVisible(value:unknown,id:string,doc:string,fp:string,epoch:number){
  if(!Array.isArray(value)||value.length!==1)return false;
  const rec=value[0],meta=rec?.metadata;
  return rec?.id===id&&meta?.sourceFileId===doc&&
    meta?.sourceFingerprint===fp&&meta?.stagedGeneration===epoch&&
    meta?.stagedLayer==="map"&&meta?.contentType==="document-map"&&
    meta?.status==="active"&&typeof meta.text==="string"&&meta.text.length>0&&
    typeof meta.fileName==="string"&&meta.fileName.length>0&&
    typeof meta.sourcePath==="string"&&meta.sourcePath.length>0&&
    Number.isSafeInteger(meta.page)&&meta.page>0&&
    Number.isSafeInteger(meta.pageEnd)&&meta.pageEnd>=meta.page;
}
async function allRows(db:CoordinatorDB,sql:string,params:unknown[]){
  const query=db.prepare(sql).bind(...params) as unknown as {
    all:()=>Promise<{results?:Array<Record<string,unknown>>}>
  };
  const result=await query.all();
  if(!Array.isArray(result?.results))abort("D1_UNAVAILABLE");
  return result.results as Array<Record<string,unknown>>;
}
export async function preflightExactMissingQa106BMap(
 db:CoordinatorDB,lease:ArchiveLease,doc:string,fp:string,
 epoch:number,windowKey:string,mapVersion:number,
 indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<ExactRepairPlan>{
  validateArchiveLease(lease);validateStagingEpoch(epoch);
  if(lease.jobKey!==QA106_B_JOB||doc!==QA106_B_PDF_ID||
     !sha.test(fp)||!sha.test(windowKey)||mapVersion!==4)
    abort("SCOPE_DENIED");
  const current=await db.prepare(
    "SELECT staging_epoch,source_fingerprint FROM ingestion_v2_document_epochs "+
    "WHERE document_id=? AND job_key=?").bind(doc,QA106_B_JOB).first();
  if(Number(current?.staging_epoch)!==epoch||current?.source_fingerprint!==fp)
    abort("REVISION_CHANGED");
  const publishedA=await db.prepare(
    "SELECT source_fingerprint,raw_count,evidence_count,map_count FROM "+
    "ingestion_v2_publications WHERE document_id=? AND job_key=?"
  ).bind(QA106_A_PDF_ID,QA106_A_JOB).first();
  if(!sha.test(String(publishedA?.source_fingerprint||""))||
     Number(publishedA?.raw_count)<2||
     Number(publishedA?.evidence_count)<2||
     Number(publishedA?.map_count)<2)
    abort("A_NOT_PUBLISHED");
  const publishedB=await db.prepare(
    "SELECT 1 AS published FROM ingestion_v2_publications WHERE document_id=?"
  ).bind(doc).first();
  if(publishedB)abort("B_ALREADY_PUBLISHED");
  const evidence=await db.prepare(
    "SELECT COUNT(*) AS n FROM ingestion_v2_staged_evidence "+
    "WHERE document_id=? AND generation=? AND source_fingerprint=?"
  ).bind(doc,epoch,fp).first();
  const raw=await db.prepare(
    "SELECT COUNT(*) AS n FROM ingestion_v2_vector_receipts "+
    "WHERE document_id=? AND generation=? AND layer='raw' AND source_fingerprint=?"
  ).bind(doc,epoch,fp).first();
  if(Number(evidence?.n)<2||Number(raw?.n)<2)
    abort("B_RAW_EVIDENCE_INCOMPLETE");
  const windows=await allRows(db,
    "SELECT ids_json FROM ingestion_v2_pending_map_windows "+
    "WHERE document_id=? AND job_key=? AND generation=? "+
    "AND source_fingerprint=? AND window_key=? AND map_version=?",
    [doc,QA106_B_JOB,epoch,fp,windowKey,mapVersion]);
  if(windows.length!==1)abort("WINDOW_NOT_UNIQUE");
  let entries:Entry[]=[];
  try{entries=JSON.parse(String(windows[0].ids_json))}
  catch{abort("WINDOW_CORRUPT")}
  if(!Array.isArray(entries)||entries.length!==2||
     new Set(entries.map(e=>e?.logicalId)).size!==2||
     new Set(entries.map(e=>e?.stagedId)).size!==2||
     entries.some(e=>!logical.test(e?.logicalId)||!physical.test(e?.stagedId)||
       e.stagedId!==immutableVectorId(lease,doc,"map",e.logicalId,fp,epoch)))
    abort("WINDOW_CORRUPT");
  const receipts=await allRows(db,
    "SELECT logical_id,staged_id,source_fingerprint FROM ingestion_v2_vector_receipts "+
    "WHERE document_id=? AND generation=? AND layer='map'",
    [doc,epoch]);
  if(receipts.length!==1)abort("RECEIPT_COUNT_CHANGED");
  const receipt=receipts[0] as Receipt;
  const existing=entries.find(e=>e.logicalId===receipt.logical_id);
  if(!existing||existing.stagedId!==receipt.staged_id||
     receipt.source_fingerprint!==fp)
    abort("RECEIPT_MISMATCH");
  let missing:Entry|null=null;
  for(const entry of entries){
    let left:unknown,right:unknown;
    try{[left,right]=await Promise.all(indexes.map(i=>i.getByIds([entry.stagedId])))}
    catch{abort("READBACK_UNAVAILABLE")}
    if(!Array.isArray(left)||!Array.isArray(right))
      throw Error("QA106_B_REPAIR_READBACK_INVALID");
    const a=left as unknown[],b=right as unknown[];
    if(a.length>1||b.length>1)
      throw Error("QA106_B_REPAIR_READBACK_INVALID");
    if(entry.logicalId===existing!.logicalId){
      if(!goodVisible(left,entry.stagedId,doc,fp,epoch)||
         !goodVisible(right,entry.stagedId,doc,fp,epoch))
        abort("EXISTING_PAIR_INVALID");
    }else{
      // Half-pair would risk unsafe insert/idempotency; never overwrite it.
      if(a.length||b.length)abort("MISSING_PAIR_CHANGED");
      missing=entry;
    }
  }
  if(!missing)throw Error("QA106_B_REPAIR_MISSING_PAIR_UNKNOWN");
  return {entries,missingLogicalId:missing.logicalId,
    missingPhysicalId:missing.stagedId,documentEpoch:epoch};
}
export function assertExactQa106BRegeneration(
 plan:ExactRepairPlan,regeneratedLogicalIds:string[],
):number{
  if(!Array.isArray(regeneratedLogicalIds)||
     regeneratedLogicalIds.length!==plan.entries.length||
     new Set(regeneratedLogicalIds).size!==plan.entries.length||
     regeneratedLogicalIds.some(x=>!logical.test(x))||
     !plan.entries.every(e=>regeneratedLogicalIds.includes(e.logicalId)))
    abort("REGENERATION_MISMATCH");
  const index=regeneratedLogicalIds.indexOf(plan.missingLogicalId);
  if(index<0)abort("REGENERATION_MISMATCH");
  return index;
}
