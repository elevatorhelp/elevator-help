/**
 * QA-first immutable three-layer publication primitive.
 * ONLY a D1 CAS changes visibility. Vectorize insert() may finish after lease
 * loss but each generation has DIFFERENT physical IDs, so stale writes remain
 * invisible when readers resolve active generation from D1.
 *
 * Does not enable any Production feature flag or modify current ingestion.
 */
import {createHash} from "node:crypto";
import {validateArchiveLease, type ArchiveLease, type CoordinatorDB} from "./ingestion-global-coordinator.ts";
import {validateStagingEpoch,DOCUMENT_STAGING_EPOCH_FENCE_SQL} from "./ingestion-document-staging-epoch.ts";

export type PublicationLayer="raw"|"map";
export type VectorMatch={
  id:string;
  metadata?:Record<string,unknown>;
};
export type ImmutableIndex={
  insert:(vectors:Array<{id:string;values:number[];metadata:Record<string,unknown>}>)=>Promise<unknown>;
  getByIds:(ids:string[])=>Promise<unknown>;
};
export type ImmutableStagedVector={
  logicalId:string;
  sourceFingerprint:string;
  metadata:Record<string,unknown>;
  legacyValues:number[];
  multilingualValues:number[];
};
export type ExactEvidence={
  logicalId:string;sourceFingerprint:string;text:string;
  fileName:string;sourcePath:string;page:number;chunkIndex:number;
};
export type PublicationManifest={
  rawIds:string[];evidenceIds:string[];mapIds:string[];sourceFingerprint:string;
};
const MAX_DOC_LENGTH=180,MAX_LOGICAL_LENGTH=320,MAX_FINGERPRINT_LENGTH=256;
const MAX_MANIFEST_SIZE=4096;

function validIdentity(value:unknown,max:number):value is string{
  return typeof value==="string"&&value.length>0&&value.length<=max&&value.trim().length>0;
}
function validateDoc(doc:string,lease:ArchiveLease):void{
  validateArchiveLease(lease);
  if(!validIdentity(doc,MAX_DOC_LENGTH))throw Error("INVALID_STAGED_DOCUMENT_ID");
}
function validateStage(doc:string,id:string,fingerprint:string,lease:ArchiveLease):void{
  validateDoc(doc,lease);
  if(!validIdentity(id,MAX_LOGICAL_LENGTH)||
     !validIdentity(fingerprint,MAX_FINGERPRINT_LENGTH))
    throw Error("INVALID_STAGED_RECORD_ID");
}
function sha(value:string):string{
  return createHash("sha256").update(value,"utf8").digest("hex");
}
/** <= 60 bytes even for MAX_SAFE_INTEGER fencing generations.
 * The 160-bit prefix is a deterministic name, NOT a data authenticity proof.
 */
export function immutableVectorId(
  lease:ArchiveLease,doc:string,layer:PublicationLayer,
  logicalId:string,fingerprint:string,documentEpoch=lease.generation,
):string{
  validateStage(doc,logicalId,fingerprint,lease);
  validateStagingEpoch(documentEpoch);
  if(layer!=="raw"&&layer!=="map")throw Error("INVALID_STAGED_LAYER");
  const digest=sha(JSON.stringify([lease.jobKey,documentEpoch,doc,layer,logicalId,fingerprint]));
  const id=`v2${layer==="raw"?"r":"m"}-${documentEpoch.toString(36)}-${digest.slice(0,40)}`;
  if(Buffer.byteLength(id,"utf8")>64)throw Error("STAGED_VECTOR_ID_TOO_LONG");
  return id;
}
export function parseImmutableVectorId(value:string):{generation:number;layer:PublicationLayer}|null{
  if(typeof value!=="string")return null;
  const m=/^v2([rm])-([1-9a-z][0-9a-z]*)-([0-9a-f]{40})$/.exec(value);
  if(!m)return null;
  const generation=parseInt(m[2],36);
  if(!Number.isSafeInteger(generation)||generation<1||
      generation.toString(36)!==m[2])return null;
  return {generation,layer:m[1]==="r"?"raw":"map"};
}
function metadataValid(meta:Record<string,unknown>,doc:string,fp:string,
 layer:PublicationLayer,gen:number):boolean{
  if(meta.sourceFileId!==doc||meta.sourceFingerprint!==fp||
     meta.stagedGeneration!==gen||meta.stagedLayer!==layer||
     meta.status!=="active"||
     !validIdentity(meta.text,60000)||
     !validIdentity(meta.fileName,512)||
     !validIdentity(meta.sourcePath,1024)||
     !Number.isSafeInteger(meta.page)||(meta.page as number)<1)return false;
  if(layer==="map"){
    return meta.contentType==="document-map"&&
      Number.isSafeInteger(meta.pageEnd)&&
      (meta.pageEnd as number)>=(meta.page as number);
  }
  return meta.contentType!=="document-map"&&
    Number.isSafeInteger(meta.chunkIndex)&& (meta.chunkIndex as number)>=0;
}
function readbackValid(result:unknown,id:string,doc:string,fp:string,
  layer:PublicationLayer,gen:number):boolean{
  if(!Array.isArray(result)||result.length!==1)return false;
  const record=result[0] as VectorMatch;
  return record?.id===id && !!record?.metadata &&
    metadataValid(record.metadata,doc,fp,layer,gen);
}
function ensureVectors(values:unknown):asserts values is number[]{
  if(!Array.isArray(values)||values.length<1||values.length>1536||
    values.some(v=>typeof v!=="number"||!Number.isFinite(v)))
    throw Error("INVALID_STAGED_VECTOR_VALUES");
}
async function leaseActive(db:CoordinatorDB,lease:ArchiveLease,now:number){
  const row=await db.prepare(`
    SELECT 1 AS valid FROM ingestion_global_leases
    WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
  `).bind(lease.jobKey,lease.owner,lease.generation,now).first();
  if(Number(row?.valid)!==1)throw Error("IMMUTABLE_STAGE_LEASE_STALE");
}

/**
 * Uses Vectorize insert(), NOT upsert(), to avoid overwriting an existing ID
 * if a late/expired request retries. Readback requires BOTH physical indices,
 * the exact revision, layer and positive physical source page.
 */
export async function stageImmutableVectorPair(
 db:CoordinatorDB,lease:ArchiveLease,documentId:string,layer:PublicationLayer,
 record:ImmutableStagedVector,indices:readonly [ImmutableIndex,ImmutableIndex],
 now=Date.now(),documentEpoch?:number,
):Promise<string>{
  validateStage(documentId,record.logicalId,record.sourceFingerprint,lease);
  const stageEpoch=documentEpoch??lease.generation;
  validateStagingEpoch(stageEpoch);
  if(layer!=="raw"&&layer!=="map")throw Error("INVALID_STAGED_LAYER");
  ensureVectors(record.legacyValues);ensureVectors(record.multilingualValues);
  const meta={...record.metadata,sourceFileId:documentId,
    sourceFingerprint:record.sourceFingerprint,
    stagedGeneration:stageEpoch,stagedLayer:layer};
  if(!metadataValid(meta,documentId,record.sourceFingerprint,layer,stageEpoch))
    throw Error("INVALID_STAGED_SOURCE_METADATA");
  if(!Array.isArray(indices)||indices.length!==2||
      indices.some(x=>!x||typeof x.insert!=="function"||typeof x.getByIds!=="function"))
    throw Error("STAGED_VECTOR_INDEX_UNAVAILABLE");
  const id=immutableVectorId(lease,documentId,layer,record.logicalId,record.sourceFingerprint,stageEpoch);
  await leaseActive(db,lease,now);
  await Promise.all([
    indices[0].insert([{id,values:record.legacyValues,metadata:meta}]),
    indices[1].insert([{id,values:record.multilingualValues,metadata:meta}]),
  ]);
  // Eventual consistency: if either index has not yet made the vector visible,
  // reject the receipt. A later explicit retry can re-check it.
  const found=await Promise.all([
    indices[0].getByIds([id]),indices[1].getByIds([id]),
  ]);
  if(!found.every(x=>readbackValid(x,id,documentId,record.sourceFingerprint,layer,stageEpoch)))
    throw Error("STAGED_DUAL_VECTOR_READBACK_NOT_READY");

  const at=Date.now();
  // The receipt is atomically conditioned on the SAME live generation, after
  // remote calls. A late stale worker cannot create a durable receipt.
  const row=await db.prepare(`
    INSERT INTO ingestion_v2_vector_receipts
    (document_id,generation,layer,logical_id,staged_id,source_fingerprint,created_at_ms)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM ingestion_global_leases
      WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    ) ${documentEpoch!==undefined?DOCUMENT_STAGING_EPOCH_FENCE_SQL:""}
    ON CONFLICT(document_id,generation,layer,logical_id) DO UPDATE
    SET created_at_ms=ingestion_v2_vector_receipts.created_at_ms
    WHERE ingestion_v2_vector_receipts.staged_id=excluded.staged_id
      AND ingestion_v2_vector_receipts.source_fingerprint=excluded.source_fingerprint
    RETURNING staged_id
  `).bind(documentId,stageEpoch,layer,record.logicalId,id,
       record.sourceFingerprint,at,lease.jobKey,lease.owner,lease.generation,at,
       ...(documentEpoch!==undefined?[documentId,lease.jobKey,stageEpoch,record.sourceFingerprint]:[])).first();
  if(row?.staged_id!==id)throw Error("STAGED_VECTOR_RECEIPT_DENIED");
  return id;
}
export async function stageImmutableExactEvidence(
 db:CoordinatorDB,lease:ArchiveLease,documentId:string,
 evidence:ExactEvidence, now=Date.now(),documentEpoch?:number,
):Promise<boolean>{
  validateStage(documentId,evidence.logicalId,evidence.sourceFingerprint,lease);
  const stageEpoch=documentEpoch??lease.generation;
  validateStagingEpoch(stageEpoch);
  if(!validIdentity(evidence.text,60000)||
    !validIdentity(evidence.fileName,512)||
    !validIdentity(evidence.sourcePath,1024)||
    !Number.isSafeInteger(evidence.page)||evidence.page<1||
    !Number.isSafeInteger(evidence.chunkIndex)||evidence.chunkIndex<0)
    throw Error("INVALID_IMMUTABLE_EVIDENCE_PAGE");
  const row=await db.prepare(`
    INSERT INTO ingestion_v2_staged_evidence
    (document_id,generation,logical_id,source_fingerprint,text,
     file_name,source_path,page,chunk_index,created_at_ms)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM ingestion_global_leases
      WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    ) ${documentEpoch!==undefined?DOCUMENT_STAGING_EPOCH_FENCE_SQL:""}
    ON CONFLICT(document_id,generation,logical_id) DO UPDATE
    SET created_at_ms=ingestion_v2_staged_evidence.created_at_ms
    WHERE ingestion_v2_staged_evidence.source_fingerprint=excluded.source_fingerprint
      AND ingestion_v2_staged_evidence.text=excluded.text
      AND ingestion_v2_staged_evidence.file_name=excluded.file_name
      AND ingestion_v2_staged_evidence.source_path=excluded.source_path
      AND ingestion_v2_staged_evidence.page=excluded.page
      AND ingestion_v2_staged_evidence.chunk_index=excluded.chunk_index
    RETURNING logical_id
  `).bind(documentId,stageEpoch,evidence.logicalId,evidence.sourceFingerprint,
     evidence.text,evidence.fileName,evidence.sourcePath,evidence.page,
     evidence.chunkIndex,now,lease.jobKey,lease.owner,lease.generation,now,
     ...(documentEpoch!==undefined?[documentId,lease.jobKey,stageEpoch,evidence.sourceFingerprint]:[])).first();
  return row?.logical_id===evidence.logicalId;
}
function manifestIds(xs:unknown):xs is string[]{
  return Array.isArray(xs)&&xs.length>0&&xs.length<=MAX_MANIFEST_SIZE&&
    xs.every(id=>validIdentity(id,MAX_LOGICAL_LENGTH))&&
    new Set(xs).size===xs.length;
}
export function validateFullImmutableManifest(manifest:PublicationManifest):void{
  if(!manifest || !validIdentity(manifest.sourceFingerprint,MAX_FINGERPRINT_LENGTH)||
    !manifestIds(manifest.rawIds)||!manifestIds(manifest.evidenceIds)||
    !manifestIds(manifest.mapIds)||
    manifest.rawIds.length+manifest.mapIds.length>MAX_MANIFEST_SIZE)
    throw Error("INVALID_IMMUTABLE_PUBLICATION_MANIFEST");
}
export async function publishImmutableThreeLayerGeneration(
 db:CoordinatorDB,lease:ArchiveLease,documentId:string,
 manifest:PublicationManifest,now=Date.now(),documentEpoch?:number,
):Promise<boolean>{
  validateDoc(documentId,lease);validateFullImmutableManifest(manifest);
  const stageEpoch=documentEpoch??lease.generation;
  validateStagingEpoch(stageEpoch);
  const groups=[
    ["ingestion_v2_vector_receipts","raw",manifest.rawIds],
    ["ingestion_v2_staged_evidence",null,manifest.evidenceIds],
    ["ingestion_v2_vector_receipts","map",manifest.mapIds],
  ] as const;
  const params:unknown[]=[
    documentId,lease.jobKey,stageEpoch,manifest.sourceFingerprint,
    sha(JSON.stringify([documentId,stageEpoch,manifest])),manifest.rawIds.length,
    manifest.evidenceIds.length,manifest.mapIds.length,now,
    lease.jobKey,lease.owner,lease.generation,now,
  ];
  // Vector manifests carry the actual physical V2 IDs returned after both
  // Vectorize indexes pass readback. Exact Evidence uses stable logical IDs.
  // Comparing physical IDs to logical_id silently blocked every real publish.
  for(const [table,layer,ids] of groups){
    if(layer && ids.some(id=>{
      const decoded=parseImmutableVectorId(id);
      return !decoded || decoded.layer!==layer ||
        decoded.generation!==stageEpoch;
    }))return false;
  }
  const clauses:string[]=[];
  for(const [table,layer,ids] of groups){
    const layerClause=layer?" AND layer=?":"";
    const where=`document_id=? AND generation=?${layerClause}`;
    clauses.push(`(SELECT COUNT(*) FROM ${table} WHERE ${where})=?
      AND NOT EXISTS(
        SELECT 1 FROM ${table} x
        WHERE x.document_id=? AND x.generation=?${layer?" AND x.layer=?":""}
          AND (x.source_fingerprint<>? OR NOT EXISTS(
            SELECT 1 FROM json_each(?) j WHERE j.value=x.${layer?"staged_id":"logical_id"}))
      )`);
    params.push(documentId,stageEpoch,...(layer?[layer]:[]),ids.length,
      documentId,stageEpoch,...(layer?[layer]:[]),
      manifest.sourceFingerprint,JSON.stringify(ids));
  }
  // THIS statement is the only visibility/publication switch. Even a late
  // Vectorize response cannot publish after lease generation changes.
  const sql=`INSERT INTO ingestion_v2_publications
    (document_id,job_key,active_generation,source_fingerprint,manifest_sha256,
     raw_count,evidence_count,map_count,published_at_ms)
    SELECT ?,?,?,?,?,?,?,?,?
    WHERE EXISTS(
      SELECT 1 FROM ingestion_global_leases
      WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    ) ${documentEpoch!==undefined?DOCUMENT_STAGING_EPOCH_FENCE_SQL:""}
    AND ${clauses.join(" AND ")}
    ON CONFLICT(document_id) DO UPDATE SET
      job_key=excluded.job_key,
      active_generation=excluded.active_generation,
      source_fingerprint=excluded.source_fingerprint,
      manifest_sha256=excluded.manifest_sha256,
      raw_count=excluded.raw_count,evidence_count=excluded.evidence_count,
      map_count=excluded.map_count,published_at_ms=excluded.published_at_ms
    WHERE ingestion_v2_publications.job_key=excluded.job_key
      AND ingestion_v2_publications.active_generation<excluded.active_generation
    RETURNING active_generation`;
  if(documentEpoch!==undefined){
    params.splice(13,0,documentId,lease.jobKey,stageEpoch,manifest.sourceFingerprint);
  }
  const row=await db.prepare(sql).bind(...params).first();
  return Number(row?.active_generation)===stageEpoch;
}
/** Exact citation pages only from the D1-published generation.
 * Does not read uncommitted staging rows; any database error fails closed.
 */
export async function readPublishedImmutableEvidence(
 db:{prepare:(sql:string)=>{bind:(...args:unknown[])=>{
   all:()=>Promise<{results:Record<string,unknown>[]}>
 }}},documentId:string,limit=100,
):Promise<Array<{
 logicalId:string;text:string;fileName:string;sourcePath:string;
 page:number;chunkIndex:number;sourceFingerprint:string;
}>>{
 if(!validIdentity(documentId,MAX_DOC_LENGTH) ||
    !Number.isSafeInteger(limit)||limit<1||limit>250)
   throw Error("INVALID_PUBLISHED_EVIDENCE_QUERY");
 const rows=await db.prepare(`
   SELECT e.logical_id,e.text,e.file_name,e.source_path,e.page,
          e.chunk_index,e.source_fingerprint
   FROM ingestion_v2_staged_evidence e
   JOIN ingestion_v2_publications p
     ON p.document_id=e.document_id
     AND p.active_generation=e.generation
     AND p.source_fingerprint=e.source_fingerprint
   WHERE e.document_id=?
   ORDER BY e.page ASC,e.chunk_index ASC
   LIMIT ?
 `).bind(documentId,limit).all();
 if(!Array.isArray(rows?.results))throw Error("PUBLISHED_EVIDENCE_READ_UNAVAILABLE");
 return rows.results.map(row=>({
   logicalId:String(row.logical_id),text:String(row.text),
   fileName:String(row.file_name),sourcePath:String(row.source_path),
   page:Number(row.page),chunkIndex:Number(row.chunk_index),
   sourceFingerprint:String(row.source_fingerprint),
 }));
}
/** Reader-side visibility, opt-in only after routes are migrated:
 * uncommitted, stale or mismatched physical generation is never visible.
 * Legacy matches are only permitted for a doc WITHOUT a publication row.
 * DB errors fail closed.
 */
export async function filterVisibleImmutableVectors<T extends VectorMatch>(
 db:CoordinatorDB|undefined,matches:T[],legacyAllowed=false,
):Promise<T[]>{
  if(!db?.prepare)return [];
  const cached=new Map<string,Promise<Record<string,unknown>|null>>();
  const visible:T[]=[];
  for(const match of matches){
    const doc=match?.metadata?.sourceFileId;
    if(!validIdentity(doc,MAX_DOC_LENGTH))continue;
    const staged=parseImmutableVectorId(match.id);
    if(!staged && /^v2[rm]-/.test(match.id))continue;
    let row=cached.get(doc);
    if(!row){
      row=Promise.resolve().then(()=>db.prepare(`
        SELECT active_generation,source_fingerprint FROM ingestion_v2_publications
        WHERE document_id=?`).bind(doc).first());
      cached.set(doc,row);
    }
    let published:Record<string,unknown>|null;
    try {published=await row;}catch{continue;}
    if(staged){
      if(!published||published.active_generation!==staged.generation||
         match.metadata?.sourceFingerprint!==published.source_fingerprint||
         !metadataValid(match.metadata||{},doc,published.source_fingerprint as string,
             staged.layer,staged.generation))continue;
      // A generation-looking ID and matching metadata alone are insufficient:
      // the exact physical ID must have a durable, revision-bound staging receipt.
      try {
        const receipt=await db.prepare(`
          SELECT 1 AS present FROM ingestion_v2_vector_receipts
          WHERE staged_id=? AND document_id=? AND generation=?
            AND layer=? AND source_fingerprint=?
        `).bind(match.id,doc,staged.generation,staged.layer,
                published.source_fingerprint).first();
        if(Number(receipt?.present)!==1)continue;
      }catch{continue;}
      visible.push(match);
    }else if(legacyAllowed&&!published){
      visible.push(match);
    }
  }
  return visible;
}
