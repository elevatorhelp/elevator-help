/**
 * Isolated, offline-only published Map revision reader (Issue #106).
 * NOT imported by app routes or the production archive reader.
 *
 * Existing V2 reader uses source epoch and legacy Map receipts; it is NOT
 * revision-safe. This proof reader only accepts one atomic SHADOW publication
 * pointer, its matching revision payload/receipt set, unchanged source/RAW/
 * Evidence counts and complete readback from BOTH vector indexes.
 *
 * Every D1 or Vectorize failure returns [] (fail closed); no legacy fallback.
 */
import {createHash} from "node:crypto";
import {parseImmutableVectorId,type ImmutableIndex,type VectorMatch}
 from "../app/lib/ingestion-immutable-publication.ts";
import type {CoordinatorDB} from "../app/lib/ingestion-global-coordinator.ts";
import {QA106_B_PDF_ID,QA106_B_JOB} from "../app/lib/qa106-b-exact-map-repair.ts";

type RevisionEntry={
 logicalId:string;stagedId:string;text:string;metadata:Record<string,unknown>;
};
type PublishedRow=Record<string,unknown>;
const sha=(value:unknown)=>createHash("sha256")
 .update(JSON.stringify(value),"utf8").digest("hex");
const SHA=/^[a-f0-9]{64}$/;
const MAP=/^map-[a-f0-9]{40}$/;
const asNumber=(value:unknown)=>typeof value==="number"&&
 Number.isSafeInteger(value)?value:NaN;
const rowFirst=async(db:CoordinatorDB,sql:string,args:unknown[])=>
 db.prepare(sql).bind(...args).first();

function validVector(value:unknown,entry:RevisionEntry,row:PublishedRow){
 if(!Array.isArray(value)||value.length!==1)return false;
 const r=value[0],m=r?.metadata;
 return r?.id===entry.stagedId&&m?.sourceFileId===QA106_B_PDF_ID&&
   m?.sourceFingerprint===row.source_fingerprint&&
   m?.stagedGeneration===row.staging_epoch&&
   m?.stagedLayer==="map"&&m?.mapRevision===row.revision&&
   m?.text===entry.text&&m?.fileName===entry.metadata.fileName&&
   m?.sourcePath===entry.metadata.sourcePath&&
   m?.page===entry.metadata.page&&m?.pageEnd===entry.metadata.pageEnd&&
   m?.status==="active"&&m?.contentType==="document-map";
}
function parseActive(row:PublishedRow):RevisionEntry[]|null{
 if(row.document_id!==QA106_B_PDF_ID||row.job_key!==QA106_B_JOB||
    !SHA.test(String(row.source_fingerprint||""))||
    !SHA.test(String(row.manifest_sha256||""))||
    !SHA.test(String(row.payload_sha256||""))||
    !SHA.test(String(row.embeddings_sha256||""))||
    asNumber(row.staging_epoch)<1||asNumber(row.revision)!==1||
    asNumber(row.map_count)<1||asNumber(row.map_count)>12||
    asNumber(row.raw_count)!==2||asNumber(row.evidence_count)!==2||
    row.state!=="embedded")return null;
 let payload:unknown;
 try{payload=JSON.parse(String(row.payload_json))}
 catch{return null}
 const entries=(payload as {entries?:RevisionEntry[]})?.entries;
 if(!Array.isArray(entries)||entries.length!==row.map_count||
    sha(payload)!==row.payload_sha256||
    new Set(entries.map(e=>e?.logicalId)).size!==entries.length||
    new Set(entries.map(e=>e?.stagedId)).size!==entries.length)return null;
 for(const e of entries){
   const gen=parseImmutableVectorId(e?.stagedId);
   if(!MAP.test(e?.logicalId||"")||gen?.layer!=="map"||
      gen.generation!==row.staging_epoch||
      !e.metadata||e.metadata.sourceFileId!==QA106_B_PDF_ID||
      e.metadata.sourceFingerprint!==row.source_fingerprint||
      e.metadata.mapRevision!==row.revision||
      e.metadata.stagedGeneration!==row.staging_epoch||
      e.metadata.stagedLayer!=="map"||
      e.metadata.contentType!=="document-map"||
      e.metadata.status!=="active"||
      typeof e.metadata.fileName!=="string"||!e.metadata.fileName||
      typeof e.metadata.sourcePath!=="string"||!e.metadata.sourcePath||
      !Number.isSafeInteger(e.metadata.page)||Number(e.metadata.page)<1||
      !Number.isSafeInteger(e.metadata.pageEnd)||
      Number(e.metadata.pageEnd)<Number(e.metadata.page)||
      typeof e.text!=="string"||!e.text||e.text.length>60000)
      return null;
 }
 const expectedManifest=sha([
   QA106_B_PDF_ID,row.staging_epoch,row.revision,
   row.source_fingerprint,entries.map(x=>x.stagedId),"qa-only-shadow",
 ]);
 return expectedManifest===row.manifest_sha256?entries:null;
}
const selectActive=`
 SELECT p.document_id,p.job_key,p.staging_epoch,p.revision,
  p.source_fingerprint,p.manifest_sha256,p.map_count,p.raw_count,
  p.evidence_count,r.payload_json,r.payload_sha256,
  r.embeddings_sha256,r.state
 FROM qa106_map_revision_shadow_publications p
 JOIN qa106_map_revisions r
  ON r.document_id=p.document_id
   AND r.staging_epoch=p.staging_epoch
   AND r.revision=p.revision
   AND r.job_key=p.job_key
   AND r.source_fingerprint=p.source_fingerprint
 JOIN ingestion_v2_document_epochs e
  ON e.document_id=p.document_id
   AND e.job_key=p.job_key
   AND e.staging_epoch=p.staging_epoch
   AND e.source_fingerprint=p.source_fingerprint
 WHERE p.document_id=? AND p.job_key=?
   AND r.state='embedded'
   AND NOT EXISTS(SELECT 1 FROM ingestion_v2_publications
    WHERE document_id=p.document_id)
   AND (SELECT COUNT(*) FROM qa106_map_revision_receipts q
      WHERE q.document_id=p.document_id
       AND q.staging_epoch=p.staging_epoch
       AND q.revision=p.revision
       AND q.source_fingerprint=p.source_fingerprint)=p.map_count
   AND (SELECT COUNT(*) FROM ingestion_v2_vector_receipts v
      WHERE v.document_id=p.document_id AND v.generation=p.staging_epoch
       AND v.layer='raw' AND v.source_fingerprint=p.source_fingerprint)=p.raw_count
   AND (SELECT COUNT(*) FROM ingestion_v2_staged_evidence v
      WHERE v.document_id=p.document_id AND v.generation=p.staging_epoch
       AND v.source_fingerprint=p.source_fingerprint)=p.evidence_count`;

async function verifyActive(
 db:CoordinatorDB,indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<RevisionEntry[]|null>{
 const active=await rowFirst(db,selectActive,[QA106_B_PDF_ID,QA106_B_JOB]);
 if(!active)return null;
 const entries=parseActive(active);
 if(!entries)return null;
 // Validate the complete new Map, not merely the user's partial search hits.
 // One missing or corrupt Map vector must hide ALL Map matches.
 for(const entry of entries){
   const receipt=await rowFirst(db,`SELECT staged_id FROM
     qa106_map_revision_receipts
     WHERE document_id=? AND staging_epoch=? AND revision=?
       AND source_fingerprint=? AND logical_id=? AND staged_id=?`,
     [QA106_B_PDF_ID,active.staging_epoch,active.revision,
      active.source_fingerprint,entry.logicalId,entry.stagedId]);
   if(receipt?.staged_id!==entry.stagedId)return null;
   const pair=await Promise.all(indexes.map(i=>i.getByIds([entry.stagedId])));
   if(!pair.every(x=>validVector(x,entry,active)))return null;
 }
 return entries;
}
/** All visible Map candidates must be members of the exact active revision.
 * Source-epoch/legacy-receipt matches alone NEVER grant visibility here.
 * No API wiring; not an export to a user-facing route.
 */
export async function filterShadowVisibleMapVectors<T extends VectorMatch>(
 db:CoordinatorDB|undefined,
 matches:T[],indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<T[]>{
 if(!db?.prepare||!Array.isArray(matches)||!Array.isArray(indexes)||
    indexes.length!==2||indexes.some(i=>typeof i?.getByIds!=="function"))
   return [];
 try{
   const entries=await verifyActive(db,indexes);
   if(!entries)return [];
   const allowed=new Map(entries.map(e=>[e.stagedId,e]));
   const visible:T[]=[],seen=new Set<string>();
   for(const match of matches){
     if(!match||typeof match.id!=="string"||seen.has(match.id))continue;
     const entry=allowed.get(match.id);
     if(!entry)continue; // old incomplete B Map and unrelated docs excluded
     const meta=match.metadata;
     if(!validVector([{id:match.id,metadata:meta}],entry,{
       staging_epoch:meta?.stagedGeneration,
       revision:meta?.mapRevision,
       source_fingerprint:meta?.sourceFingerprint,
     }))continue;
     seen.add(match.id);visible.push(match);
   }
   return visible;
 }catch{
   return []; // D1 or any Vectorize error fails closed
 }
}
