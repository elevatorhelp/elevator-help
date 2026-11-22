/**
 * Issue #106: QA-only, offline-testable SHADOW Map supersession.
 *
 * Never imported by application routes / production ingest. Do not apply the
 * paired schema outside ephemeral QA SQLite until a separate reviewed release.
 * This module calls NO model or embedding provider. It cannot publish into
 * ingestion_v2_publications, and existing search readers cannot see its rows.
 *
 * One immutable replacement revision keeps the original B pending intent
 * and its one old Map receipt as historical evidence. A is never written.
 */
import {createHash} from "node:crypto";
import {
  validateArchiveLease,type ArchiveLease,type CoordinatorDB,
} from "../app/lib/ingestion-global-coordinator.ts";
import {
  immutableVectorId,type ImmutableIndex,
} from "../app/lib/ingestion-immutable-publication.ts";
import {
  validateStagingEpoch,DOCUMENT_STAGING_EPOCH_FENCE_SQL,
} from "../app/lib/ingestion-document-staging-epoch.ts";
import {
  QA106_B_PDF_ID,QA106_B_JOB,QA106_A_PDF_ID,QA106_A_JOB,
} from "../app/lib/qa106-b-exact-map-repair.ts";

const SHA=/^[a-f0-9]{64}$/;
const ID=/^map-[a-f0-9]{40}$/;
const MAX_NODES=12;
const abort=(code:string):never=>{throw Error("QA106_MAP_REVISION_"+code)};
const digest=(value:unknown)=>createHash("sha256")
  .update(JSON.stringify(value),"utf8").digest("hex");

export type RevisionScope={
  documentId:string;jobKey:string;fingerprint:string;
  documentEpoch:number;revision:number;supersedesWindowKey:string;
};
export type RevisionNode={
  text:string;metadata:Record<string,unknown>;
};
type RevisionEntry={
  logicalId:string;stagedId:string;text:string;metadata:Record<string,unknown>;
};
type Payload={entries:RevisionEntry[]};
type EmbeddingEntry={
  logicalId:string;legacy:number[];multilingual:number[];
};
type EmbeddingPayload={embeddings:EmbeddingEntry[]};

const rowFirst=async(db:CoordinatorDB,sql:string,args:unknown[])=>
  db.prepare(sql).bind(...args).first();
function scopeGuard(s:RevisionScope,lease:ArchiveLease){
  validateArchiveLease(lease);
  validateStagingEpoch(s.documentEpoch);
  if(s.documentId!==QA106_B_PDF_ID||s.jobKey!==QA106_B_JOB||
     lease.jobKey!==QA106_B_JOB||!SHA.test(s.fingerprint)||
     !SHA.test(s.supersedesWindowKey)||
     !Number.isSafeInteger(s.revision)||s.revision!==1)
    abort("SCOPE_DENIED");
}
const leaseFence=`EXISTS(SELECT 1 FROM ingestion_global_leases
  WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?)`;
async function ensureLive(db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope){
  scopeGuard(s,lease);
  const at=Date.now();
  const valid=await rowFirst(db,`SELECT 1 AS ok
    FROM ingestion_global_leases l
    JOIN ingestion_v2_document_epochs e ON e.job_key=l.job_key
    WHERE l.job_key=? AND l.owner=? AND l.generation=?
      AND l.lease_until_ms>? AND e.document_id=?
      AND e.staging_epoch=? AND e.source_fingerprint=?`,
    [lease.jobKey,lease.owner,lease.generation,at,
     s.documentId,s.documentEpoch,s.fingerprint]);
  if(valid?.ok!==1)abort("STALE_OWNER_OR_SOURCE");
}
const fenceArgs=(lease:ArchiveLease,s:RevisionScope,at:number)=>[
  lease.jobKey,lease.owner,lease.generation,at,
  s.documentId,s.jobKey,s.documentEpoch,s.fingerprint,
];
const srcFence=DOCUMENT_STAGING_EPOCH_FENCE_SQL;
const point=(s:RevisionScope)=>[
  s.documentId,s.documentEpoch,s.revision,
];
function validateMapNode(s:RevisionScope,node:RevisionNode):void{
 const m=node?.metadata;
 if(!m||typeof node.text!=="string"||node.text.length<1||
    node.text.length>60000||m.sourceFileId!==s.documentId||
    m.sourceFingerprint!==s.fingerprint||
    m.contentType!=="document-map"||m.status!=="active"||
    typeof m.fileName!=="string"||!m.fileName||m.fileName.length>512||
    typeof m.sourcePath!=="string"||!m.sourcePath||
    m.sourcePath.length>1024||
    !Number.isSafeInteger(m.page)||Number(m.page)<1||
    !Number.isSafeInteger(m.pageEnd)||Number(m.pageEnd)<Number(m.page))
   abort("INVALID_GENERATED_NODE");
}
function newPayload(s:RevisionScope,lease:ArchiveLease,nodes:RevisionNode[]){
 if(!Array.isArray(nodes)||nodes.length<1||nodes.length>MAX_NODES)
   abort("INVALID_NODE_COUNT");
 const entries=nodes.map(node=>{
   validateMapNode(s,node);
   // SHA includes revision, *exact* generated text, and source metadata.
   const logicalId="map-"+digest([s.documentId,s.fingerprint,s.revision,
     node.text,node.metadata]).slice(0,40);
   const stagedId=immutableVectorId(lease,s.documentId,"map",
     logicalId,s.fingerprint,s.documentEpoch);
   return {logicalId,stagedId,text:node.text,
     metadata:{...node.metadata,mapRevision:s.revision,
       stagedGeneration:s.documentEpoch,stagedLayer:"map"}};
 });
 if(new Set(entries.map(e=>e.logicalId)).size!==entries.length)
   abort("DUPLICATE_NODE");
 const payload={entries};const json=JSON.stringify(payload);
 if(Buffer.byteLength(json,"utf8")>380000)abort("PAYLOAD_TOO_LARGE");
 return {payload,json,hash:digest(payload)};
}
function parsePayload(row:Record<string,unknown>):Payload{
 let value:unknown;
 try{value=JSON.parse(String(row.payload_json))}
 catch{abort("PAYLOAD_CORRUPT")}
 if(!value||typeof value!=="object"||
   !Array.isArray((value as Payload).entries)||
   (value as Payload).entries.length<1||
   (value as Payload).entries.length>MAX_NODES||
   digest(value)!==row.payload_sha256)
   abort("PAYLOAD_CORRUPT");
 return value as Payload;
}
const vectorsOk=(v:unknown):v is number[]=>
 Array.isArray(v)&&v.length>0&&v.length<=1536&&
 v.every(n=>typeof n==="number"&&Number.isFinite(n));
function parseEmbedding(row:Record<string,unknown>):EmbeddingPayload{
 let value:unknown;
 try{value=JSON.parse(String(row.embeddings_json))}
 catch{abort("EMBEDDINGS_CORRUPT")}
 if(!value||typeof value!=="object"||
   !Array.isArray((value as EmbeddingPayload).embeddings)||
   digest(value)!==row.embeddings_sha256)
   abort("EMBEDDINGS_CORRUPT");
 return value as EmbeddingPayload;
}
async function load(db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope){
 scopeGuard(s,lease);
 const row=await rowFirst(db,`SELECT * FROM qa106_map_revisions
   WHERE document_id=? AND staging_epoch=? AND revision=?
    AND job_key=? AND source_fingerprint=? AND supersedes_window_key=?`,
   [...point(s),s.jobKey,s.fingerprint,s.supersedesWindowKey]);
 if(row===null)throw Error("QA106_MAP_REVISION_REVISION_MISSING_OR_CHANGED");
 return row;
}
/** Idempotently declare B's shadow replacement; no Gemini call, no D1 old-table mutation. */
export async function beginShadowMapRevision(
 db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope,now=Date.now(),
):Promise<void>{
 scopeGuard(s,lease);
 const at=now;
 if(!Number.isSafeInteger(at)||at<=0)abort("INVALID_CLOCK");
 const row=await rowFirst(db,`
 INSERT INTO qa106_map_revisions
   (document_id,staging_epoch,revision,job_key,source_fingerprint,
    supersedes_window_key,created_at_ms,updated_at_ms)
 SELECT ?,?,?,?,?,?,?,?
 WHERE ${leaseFence} ${srcFence}
 AND NOT EXISTS(SELECT 1 FROM ingestion_v2_publications
   WHERE document_id=?)
 AND EXISTS(SELECT 1 FROM ingestion_v2_publications
   WHERE document_id=? AND job_key=? AND map_count>=2)
 AND (SELECT COUNT(*) FROM ingestion_v2_pending_map_windows
   WHERE document_id=? AND generation=? AND job_key=?
    AND source_fingerprint=? AND window_key=?)=1
 AND (SELECT COUNT(*) FROM ingestion_v2_vector_receipts
   WHERE document_id=? AND generation=? AND layer='map')=1
 AND (SELECT COUNT(*) FROM ingestion_v2_vector_receipts
   WHERE document_id=? AND generation=? AND layer='raw'
     AND source_fingerprint=?)=2
 AND (SELECT COUNT(*) FROM ingestion_v2_staged_evidence
   WHERE document_id=? AND generation=? AND source_fingerprint=?)=2
 AND NOT EXISTS(SELECT 1 FROM qa106_map_revisions
   WHERE document_id=? AND staging_epoch=? AND revision<>?)
 ON CONFLICT(document_id,staging_epoch,revision) DO UPDATE SET
   updated_at_ms=qa106_map_revisions.updated_at_ms
 WHERE qa106_map_revisions.job_key=excluded.job_key
   AND qa106_map_revisions.source_fingerprint=excluded.source_fingerprint
   AND qa106_map_revisions.supersedes_window_key=excluded.supersedes_window_key
 RETURNING revision`,
 [...point(s).slice(0,2),s.revision,s.jobKey,s.fingerprint,
  s.supersedesWindowKey,at,at,
  ...fenceArgs(lease,s,at),
  s.documentId,QA106_A_PDF_ID,QA106_A_JOB,
  s.documentId,s.documentEpoch,s.jobKey,s.fingerprint,s.supersedesWindowKey,
  s.documentId,s.documentEpoch,
  s.documentId,s.documentEpoch,s.fingerprint,
  s.documentId,s.documentEpoch,s.fingerprint,
  s.documentId,s.documentEpoch,s.revision]);
 if(row?.revision!==s.revision)abort("PRECONDITIONS_OR_LEASE_DENIED");
}
/** ONE D1 CAS stores exact generated text/metadata and stable IDs before embeddings. */
export async function persistGeneratedMapPayload(
 db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope,nodes:RevisionNode[],
 now=Date.now(),
):Promise<Payload>{
 scopeGuard(s,lease);
 const prepared=newPayload(s,lease,nodes);
 const changed=await rowFirst(db,`UPDATE qa106_map_revisions
 SET payload_json=?,payload_sha256=?,state='generated',updated_at_ms=?
 WHERE document_id=? AND staging_epoch=? AND revision=? AND job_key=?
   AND source_fingerprint=? AND supersedes_window_key=?
   AND (state='planned' OR
        (state='generated' AND payload_sha256=? AND payload_json=?))
   AND ${leaseFence} ${srcFence}
 RETURNING payload_sha256`,
 [prepared.json,prepared.hash,now,...point(s),s.jobKey,s.fingerprint,
 s.supersedesWindowKey,prepared.hash,prepared.json,
 ...fenceArgs(lease,s,now)]);
 if(changed?.payload_sha256!==prepared.hash)
   abort("GENERATED_PAYLOAD_CONFLICT_OR_STALE");
 return prepared.payload;
}
/** Store BOTH embedding vectors before any external index insertion. */
export async function persistMapEmbeddings(
 db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope,
 embeddings:EmbeddingEntry[],now=Date.now(),
):Promise<void>{
 scopeGuard(s,lease);
 const row=await load(db,lease,s);
 if(row.state!=="generated"&&row.state!=="embedded")
   abort("PAYLOAD_NOT_DURABLE");
 const payload=parsePayload(row);
 const wanted=new Set(payload.entries.map(e=>e.logicalId));
 if(!Array.isArray(embeddings)||embeddings.length!==wanted.size||
    new Set(embeddings.map(e=>e?.logicalId)).size!==wanted.size||
    embeddings.some(e=>!wanted.has(e?.logicalId)||
       !vectorsOk(e.legacy)||!vectorsOk(e.multilingual)))
   abort("EMBEDDING_SET_INVALID");
 const byId=new Map(embeddings.map(e=>[e.logicalId,e]));
 const ordered=payload.entries.map(e=>byId.get(e.logicalId)!);
 const packed:EmbeddingPayload={embeddings:ordered};
 const json=JSON.stringify(packed),hash=digest(packed);
 if(Buffer.byteLength(json,"utf8")>650000)
   abort("EMBEDDINGS_TOO_LARGE");
 const result=await rowFirst(db,`UPDATE qa106_map_revisions
 SET embeddings_json=?,embeddings_sha256=?,state='embedded',updated_at_ms=?
 WHERE document_id=? AND staging_epoch=? AND revision=? AND job_key=?
  AND source_fingerprint=? AND supersedes_window_key=?
  AND payload_sha256=?
  AND (state='generated' OR
    (state='embedded' AND embeddings_sha256=? AND embeddings_json=?))
  AND ${leaseFence} ${srcFence}
 RETURNING embeddings_sha256`,
 [json,hash,now,...point(s),s.jobKey,s.fingerprint,
 s.supersedesWindowKey,row.payload_sha256,hash,json,
 ...fenceArgs(lease,s,now)]);
 if(result?.embeddings_sha256!==hash)
   abort("EMBEDDING_CONFLICT_OR_STALE");
}
function validatesPhysical(value:unknown,entry:RevisionEntry,s:RevisionScope){
 if(!Array.isArray(value)||value.length!==1)return false;
 const vector=value[0],m=vector?.metadata;
 return vector?.id===entry.stagedId&&m?.text===entry.text&&
  m?.sourceFileId===s.documentId&&
  m?.sourceFingerprint===s.fingerprint&&
  m?.stagedGeneration===s.documentEpoch&&m?.stagedLayer==="map"&&
  m?.mapRevision===s.revision&&m?.contentType==="document-map"&&
  m?.status==="active"&&m?.fileName===entry.metadata.fileName&&
  m?.sourcePath===entry.metadata.sourcePath&&m?.page===entry.metadata.page&&
  m?.pageEnd===entry.metadata.pageEnd;
}
export async function reconcileShadowMapRevision(
 db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope,
 indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<{status:"pending"|"complete";receipts:number}>{
 await ensureLive(db,lease,s);
 const row=await load(db,lease,s);
 if(row.state!=="embedded")abort("EMBEDDINGS_NOT_DURABLE");
 const payload=parsePayload(row),embedding=parseEmbedding(row);
 const byId=new Map(embedding.embeddings.map(x=>[x.logicalId,x]));
 if(byId.size!==payload.entries.length)abort("EMBEDDINGS_CORRUPT");
 let receipts=0;
 for(const entry of payload.entries){
   const x=byId.get(entry.logicalId);
   if(!x||!vectorsOk(x.legacy)||!vectorsOk(x.multilingual))
     throw Error("QA106_MAP_REVISION_EMBEDDINGS_CORRUPT");
   const current=await rowFirst(db,`SELECT staged_id FROM qa106_map_revision_receipts
     WHERE document_id=? AND staging_epoch=? AND revision=? AND logical_id=?`,
     [...point(s),entry.logicalId]);
   if(current&&current.staged_id!==entry.stagedId)abort("RECEIPT_ID_CONFLICT");
   let hits:unknown[]=[];
   try{hits=await Promise.all(indexes.map(i=>i.getByIds([entry.stagedId])))}
   catch{abort("VECTOR_READ_FAILED")}
   if(!hits.every(Array.isArray))abort("VECTOR_READ_INVALID");
   const found=hits as unknown[][];
   if(found.some(a=>a.length>1))abort("VECTOR_READ_INVALID");
   if(found.some(a=>a.length===1)&&found.some(a=>a.length===0))
     abort("HALF_INDEX_PAIR");
   if(found.every(a=>a.length===0)){
     if(current)abort("RECEIPT_WITHOUT_PAIR");
     await ensureLive(db,lease,s);
     // INSERT, never UPSERT. A late stale insert is invisible to all readers.
     const m={...entry.metadata,text:entry.text,
       sourceFileId:s.documentId,sourceFingerprint:s.fingerprint,
       stagedGeneration:s.documentEpoch,stagedLayer:"map",
       mapRevision:s.revision};
     await Promise.all([
       indexes[0].insert([{id:entry.stagedId,values:x.legacy,metadata:m}]),
       indexes[1].insert([{id:entry.stagedId,values:x.multilingual,metadata:m}]),
     ]);
     // Vectorize is eventually consistent; next run may attest without
     // re-embedding or reinserting. Missing readback is never a receipt.
     try{hits=await Promise.all(indexes.map(i=>i.getByIds([entry.stagedId])))}
     catch{abort("VECTOR_READ_FAILED")}
   }
   if(!hits.every(v=>validatesPhysical(v,entry,s))){
     // If both are still empty, it is an eventual visibility delay.
     if(hits.every(v=>Array.isArray(v)&&v.length===0))
       return {status:"pending",receipts};
     abort("VECTOR_METADATA_OR_HALF_PAIR");
   }
   const at=Date.now();
   const receipt=await rowFirst(db,`INSERT INTO qa106_map_revision_receipts
    (document_id,staging_epoch,revision,logical_id,staged_id,
      source_fingerprint,created_at_ms)
    SELECT ?,?,?,?,?,?,? WHERE ${leaseFence} ${srcFence}
    AND EXISTS(SELECT 1 FROM qa106_map_revisions
       WHERE document_id=? AND staging_epoch=? AND revision=?
       AND source_fingerprint=? AND embeddings_sha256=? AND state='embedded')
    ON CONFLICT(document_id,staging_epoch,revision,logical_id) DO UPDATE
      SET created_at_ms=qa106_map_revision_receipts.created_at_ms
    WHERE qa106_map_revision_receipts.staged_id=excluded.staged_id
      AND qa106_map_revision_receipts.source_fingerprint=excluded.source_fingerprint
    RETURNING staged_id`,
    [...point(s),entry.logicalId,entry.stagedId,s.fingerprint,at,
    ...fenceArgs(lease,s,at),
    ...point(s),s.fingerprint,row.embeddings_sha256]);
   if(receipt?.staged_id!==entry.stagedId)
     abort("RECEIPT_STALE_OR_MISMATCH");
   receipts++;
 }
 return {status:"complete",receipts};
}
/** Restart from write-ahead state. No model/embedding call is made here.
 * After 'embedded', the exact vectors are durable and all retries can use
 * this snapshot without ANY model-provider request. */
export async function readDurableShadowRevision(
 db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope,
):Promise<{state:"planned"|"generated"|"embedded";
 payload:Payload|null;embeddings:EmbeddingPayload|null}>{
 await ensureLive(db,lease,s);
 const row=await load(db,lease,s);
 if(row.state!=="planned"&&row.state!=="generated"&&
    row.state!=="embedded")abort("STATE_INVALID");
 const state=row.state as "planned"|"generated"|"embedded";
 const payload=state==="planned"?null:parsePayload(row);
 const embeddings=state==="embedded"?parseEmbedding(row):null;
 return {state,payload,embeddings};
}

/** SHADOW publication: NOT connected to the real published/archive readers. */
export async function publishShadowMapRevision(
 db:CoordinatorDB,lease:ArchiveLease,s:RevisionScope,
 indexes:readonly [ImmutableIndex,ImmutableIndex],
 now=Date.now(),
):Promise<boolean>{
 const verified=await reconcileShadowMapRevision(db,lease,s,indexes);
 if(verified.status!=="complete")return false;
 const row=await load(db,lease,s),payload=parsePayload(row);
 const ids=payload.entries.map(e=>e.stagedId);
 const manifest=digest([s.documentId,s.documentEpoch,s.revision,
   s.fingerprint,ids,"qa-only-shadow"]);
 const result=await rowFirst(db,`INSERT INTO qa106_map_revision_shadow_publications
   (document_id,staging_epoch,revision,job_key,source_fingerprint,
    manifest_sha256,map_count,raw_count,evidence_count,published_at_ms)
 SELECT ?,?,?,?,?,?,?,?,?,?
 WHERE ${leaseFence} ${srcFence}
   AND EXISTS(SELECT 1 FROM qa106_map_revisions
     WHERE document_id=? AND staging_epoch=? AND revision=?
       AND job_key=? AND source_fingerprint=? AND payload_sha256=?
       AND embeddings_sha256=? AND state='embedded')
   AND NOT EXISTS(SELECT 1 FROM ingestion_v2_publications WHERE document_id=?)
   AND (SELECT COUNT(*) FROM ingestion_v2_vector_receipts
      WHERE document_id=? AND generation=? AND layer='raw'
        AND source_fingerprint=?)=2
   AND (SELECT COUNT(*) FROM ingestion_v2_staged_evidence
      WHERE document_id=? AND generation=? AND source_fingerprint=?)=2
   AND (SELECT COUNT(*) FROM qa106_map_revision_receipts
      WHERE document_id=? AND staging_epoch=? AND revision=?
        AND source_fingerprint=?)=?
   AND NOT EXISTS(SELECT 1 FROM qa106_map_revision_receipts q
      WHERE q.document_id=? AND q.staging_epoch=? AND q.revision=?
        AND (q.source_fingerprint<>?
          OR NOT EXISTS (SELECT 1 FROM json_each(?) j
            WHERE j.value=q.staged_id)))
 ON CONFLICT(document_id) DO UPDATE SET
  published_at_ms=qa106_map_revision_shadow_publications.published_at_ms
 WHERE qa106_map_revision_shadow_publications.staging_epoch=excluded.staging_epoch
   AND qa106_map_revision_shadow_publications.revision=excluded.revision
   AND qa106_map_revision_shadow_publications.manifest_sha256=excluded.manifest_sha256
 RETURNING manifest_sha256`,
 [s.documentId,s.documentEpoch,s.revision,s.jobKey,s.fingerprint,
 manifest,ids.length,2,2,now,
 ...fenceArgs(lease,s,now),
 ...point(s),s.jobKey,s.fingerprint,row.payload_sha256,row.embeddings_sha256,
 s.documentId,
 s.documentId,s.documentEpoch,s.fingerprint,
 s.documentId,s.documentEpoch,s.fingerprint,
 ...point(s),s.fingerprint,ids.length,
 ...point(s),s.fingerprint,JSON.stringify(ids)]);
 return result?.manifest_sha256===manifest;
}
