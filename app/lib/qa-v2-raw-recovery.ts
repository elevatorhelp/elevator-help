/**
 * QA-only immutable RAW recovery BEFORE any new Gemini/Workers AI calls.
 *
 * A previous run can stage a vector pair (and its D1 receipt) before its
 * runner's checkpoint is written. A successor must reuse that verified pair
 * instead of paying Gemini again and re-inserting the same physical ID.
 * If only ONE vector index contains a physical ID, fail closed: never
 * overwrite, duplicate or spend until the partial state is resolved.
 *
 * This cannot infer whether an orphaned provider call generated tokens but
 * never wrote either Vectorize index: provider-side billing is separate.
 */
import {
  immutableVectorId,attestExistingImmutableVectorPair,
  type ImmutableIndex,
} from "./ingestion-immutable-publication.ts";
import type {ArchiveLease,CoordinatorDB} from "./ingestion-global-coordinator.ts";

const fail=(code:string):never=>{throw Error(code);};
function readOne(found:unknown,expected:string){
  if(!Array.isArray(found)||found.length>1)
    fail("V2_RAW_RECOVERY_INVALID_VECTOR_READBACK");
  if(found.length===0)return false;
  if(found[0]?.id!==expected)
    fail("V2_RAW_RECOVERY_INVALID_VECTOR_READBACK");
  return true;
}
export async function reconcileExistingQaV2RawChunks(
  db:CoordinatorDB,lease:ArchiveLease,documentId:string,
  sourceFingerprint:string,epoch:number,
  logicalIds:string[],
  indices:readonly [ImmutableIndex,ImmutableIndex],
  assertLease:()=>Promise<void>=async()=>{},
):Promise<Map<string,string>>{
  if(!Array.isArray(logicalIds)||logicalIds.length<1||logicalIds.length>8||
     new Set(logicalIds).size!==logicalIds.length)
    fail("V2_RAW_RECOVERY_DUPLICATE_OR_INVALID_BATCH");
  if(!Array.isArray(indices)||indices.length!==2||
     indices.some(x=>!x || typeof x.getByIds!=="function"))
    fail("V2_RAW_RECOVERY_INDEX_UNAVAILABLE");
  const reused=new Map<string,string>();
  for(const logicalId of logicalIds){
    await assertLease();
    const physicalId=immutableVectorId(
      lease,documentId,"raw",logicalId,sourceFingerprint,epoch);
    let row:Record<string,unknown>|null;
    try{
      row=await db.prepare(
        "SELECT staged_id FROM ingestion_v2_vector_receipts "+
        "WHERE document_id=? AND generation=? AND layer='raw' "+
        "AND logical_id=? AND source_fingerprint=?"
      ).bind(documentId,epoch,logicalId,sourceFingerprint).first();
    }catch{fail("V2_RAW_RECOVERY_D1_UNAVAILABLE");}
    if(row && row.staged_id!==physicalId)
      fail("V2_RAW_RECOVERY_RECEIPT_MISMATCH");
    // Index readback is free of model calls and works across successor leases.
    // A previously stored receipt is not trusted if either physical index
    // subsequently becomes unavailable.
    let a:unknown,b:unknown;
    try{[a,b]=await Promise.all(indices.map(i=>i.getByIds([physicalId])));}
    catch{fail("V2_RAW_RECOVERY_INDEX_UNAVAILABLE");}
    const presentA=readOne(a,physicalId),presentB=readOne(b,physicalId);
    if(presentA!==presentB)
      fail("V2_RAW_RECOVERY_INCOMPLETE_PAIR");
    if(row && !presentA)
      fail("V2_RAW_RECOVERY_RECEIPT_VECTOR_MISSING");
    if(!presentA)continue;
    // Check exact metadata/fingerprint/epoch and create any missing receipt.
    // No embedding, Gemini generation, or Vectorize insertion is performed.
    let reconciled=false;
    try{
      reconciled=await attestExistingImmutableVectorPair(
        db,lease,documentId,"raw",logicalId,sourceFingerprint,indices,epoch);
    }catch{fail("V2_RAW_RECOVERY_ATTESTATION_DENIED");}
    if(!reconciled)fail("V2_RAW_RECOVERY_LATE_READBACK");
    reused.set(logicalId,physicalId);
  }
  return reused;
}
