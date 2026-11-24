/**
 * Generic per-document Map revision fenced publication/read library (default-OFF).
 * CODE REVIEW PREVIEW only. Imported only by a default-OFF feature gate;
 * it must NOT be configured in QA or Production before audited migration,
 * read-path validation and explicit owner release authorization.
 *
 * Maintains the existing source epoch and RAW/Evidence receipts, but switches
 * a NEW revision-specific Map receipt set via one fenced D1 activation CAS.
 * Published legacy documents without revision candidates remain compatible.
 * Once any candidate exists, absence of an active pointer DENIES fallback.
 */
import {createHash} from "node:crypto";
import {
 immutableVectorId,parseImmutableVectorId,filterVisibleImmutableVectors,
 type ImmutableIndex,type VectorMatch,
} from "./ingestion-immutable-publication.ts";
import {
 validateArchiveLease,type ArchiveLease,type CoordinatorDB,
} from "./ingestion-global-coordinator.ts";
import {validateStagingEpoch,DOCUMENT_STAGING_EPOCH_FENCE_SQL}
 from "./ingestion-document-staging-epoch.ts";

export type MapRevisionScope={
 documentId:string;jobKey:string;epoch:number;revision:number;fingerprint:string;
};
export type MapEntry={
 logicalId:string;stagedId:string;text:string;metadata:Record<string,unknown>;
};
export type MapRevisionPayload={entries:MapEntry[]};
type Active=Record<string,unknown>;
const digest=(x:unknown)=>createHash("sha256").update(JSON.stringify(x),"utf8").digest("hex");
const HASH=/^[a-f0-9]{64}$/,MAP_ID=/^map-[a-f0-9]{40}$/;
const fail=(code:string):never=>{throw Error("QA106_GENERIC_REVISION_"+code)};
const q=async(db:CoordinatorDB,sql:string,args:unknown[])=>
 db.prepare(sql).bind(...args).first();
async function rows(db:CoordinatorDB,sql:string,args:unknown[]){
 const bound=db.prepare(sql).bind(...args) as unknown as {
  all:()=>Promise<{results:Array<Record<string,unknown>>}>;
 };
 const r=await bound.all();
 if(!Array.isArray(r?.results))fail("D1_ROWS_UNAVAILABLE");
 return r.results;
}
const activeLeaseSql=`EXISTS(SELECT 1 FROM ingestion_global_leases l
 WHERE l.job_key=? AND l.owner=? AND l.generation=?
   AND l.lease_until_ms>?)`;
const fence=(lease:ArchiveLease,s:MapRevisionScope,at:number)=>[
 lease.jobKey,lease.owner,lease.generation,at,
 s.documentId,s.jobKey,s.epoch,s.fingerprint,
];
const root=(s:MapRevisionScope)=>[s.documentId,s.epoch,s.revision];
function scope(s:MapRevisionScope,lease?:ArchiveLease){
 if(!s||typeof s.documentId!=="string"||s.documentId.length<1||
    s.documentId.length>180||typeof s.jobKey!=="string"||
    !HASH.test(s.fingerprint)||!Number.isSafeInteger(s.revision)||
    s.revision<1||s.revision>9999)
  fail("SCOPE_INVALID");
 validateStagingEpoch(s.epoch);
 if(lease){validateArchiveLease(lease);if(lease.jobKey!==s.jobKey)
   fail("WRONG_JOB_KEY")}
}
function activeVector(v:unknown,e:MapEntry,s:MapRevisionScope){
 if(!Array.isArray(v)||v.length!==1)return false;
 const x=v[0],m=x?.metadata;
 return x?.id===e.stagedId&&
  m?.sourceFileId===s.documentId&&m?.sourceFingerprint===s.fingerprint&&
  m?.stagedGeneration===s.epoch&&m?.stagedLayer==="map"&&
  m?.mapRevision===s.revision&&m?.contentType==="document-map"&&
  m?.status==="active"&&m?.text===e.text&&
  m?.fileName===e.metadata.fileName&&
  m?.sourcePath===e.metadata.sourcePath&&
  m?.page===e.metadata.page&&m?.pageEnd===e.metadata.pageEnd;
}
function validatePayload(s:MapRevisionScope,lease:ArchiveLease,
 payload:MapRevisionPayload){
 if(!payload||!Array.isArray(payload.entries)||payload.entries.length<1||
    payload.entries.length>12||
    new Set(payload.entries.map(e=>e?.logicalId)).size!==payload.entries.length||
    new Set(payload.entries.map(e=>e?.stagedId)).size!==payload.entries.length)
  fail("PAYLOAD_SET_INVALID");
 for(const e of payload.entries){
  const m=e?.metadata;
  if(!MAP_ID.test(e?.logicalId||"")||
     e.stagedId!==immutableVectorId(lease,s.documentId,"map",
       e.logicalId,s.fingerprint,s.epoch)||
     typeof e.text!=="string"||e.text.length<1||e.text.length>60000||
     !m||m.sourceFileId!==s.documentId||m.sourceFingerprint!==s.fingerprint||
     m.stagedGeneration!==s.epoch||m.stagedLayer!=="map"||
     m.mapRevision!==s.revision||m.contentType!=="document-map"||
     m.status!=="active"||
     typeof m.fileName!=="string"||m.fileName.length<1||
     typeof m.sourcePath!=="string"||m.sourcePath.length<1||
     !Number.isSafeInteger(m.page)||Number(m.page)<1||
     !Number.isSafeInteger(m.pageEnd)||Number(m.pageEnd)<Number(m.page))
      fail("PAYLOAD_ENTRY_INVALID");
 }
 // Original shadow writer hashes text and PRE-staging metadata into
 // the logical ID. Verify the cryptographic content commitment as well as
 // the generation-qualified physical ID.
 for(const e of payload.entries){
   const base={...e.metadata};
   delete base.mapRevision;delete base.stagedGeneration;delete base.stagedLayer;
   const expected="map-"+digest([s.documentId,s.fingerprint,s.revision,
     e.text,base]).slice(0,40);
   if(e.logicalId!==expected)fail("CONTENT_ADDRESS_MISMATCH");
 }
 const json=JSON.stringify(payload);
 if(Buffer.byteLength(json,"utf8")>380000)fail("PAYLOAD_TOO_LARGE");
 return {json,hash:digest(payload)};
}
const candidateSQL=`
 SELECT * FROM ingestion_v2_map_revision_candidates
 WHERE document_id=? AND staging_epoch=? AND revision=?
   AND job_key=? AND source_fingerprint=? AND state='embedded'`;
async function getCandidate(db:CoordinatorDB,s:MapRevisionScope){
 const row=await q(db,candidateSQL,[...root(s),s.jobKey,s.fingerprint]);
 if(!row)return null;
 let payload:MapRevisionPayload;
 try{payload=JSON.parse(String(row.payload_json))}
 catch{return null}
 try{
  const fake={jobKey:s.jobKey,owner:"gh-123456-aaaaaaaaaaaaaaaa",generation:1};
  if(digest(payload)!==row.payload_sha256||!HASH.test(String(row.embeddings_sha256)))
   return null;
  validatePayload(s,fake,payload);
 }catch{return null}
 return {row,payload};
}
async function liveSource(db:CoordinatorDB,s:MapRevisionScope){
 const r=await q(db,`SELECT 1 AS ok FROM ingestion_v2_document_epochs
 WHERE document_id=? AND job_key=? AND staging_epoch=? AND source_fingerprint=?`,
 [s.documentId,s.jobKey,s.epoch,s.fingerprint]);
 return r?.ok===1;
}
/** A new generic candidate is an explicit DENY-LEGACY-FALLBACK marker.
 * Only staged AFTER both vector indexes already contain the exact revision.
 * No call to Gemini/Workers AI, no physical inserts, no old-table mutations.
 */
export async function stageGenericMapCandidatePreview(
 db:CoordinatorDB,lease:ArchiveLease,s:MapRevisionScope,
 payload:MapRevisionPayload,embeddingsSha:string,
 indexes:readonly [ImmutableIndex,ImmutableIndex],
 now=Date.now(),
):Promise<void>{
 scope(s,lease);
 const checked=validatePayload(s,lease,payload);
 if(!HASH.test(embeddingsSha)||!Number.isSafeInteger(now)||now<1)
   fail("INVALID_EMBEDDING_PROOF");
 for(const e of payload.entries){
   const pair=await Promise.all(indexes.map(i=>i.getByIds([e.stagedId])));
   if(!pair.every(v=>activeVector(v,e,s)))fail("INCOMPLETE_INDEX_PAIR");
 }
 const inserted=await q(db,`INSERT INTO ingestion_v2_map_revision_candidates
   (document_id,staging_epoch,revision,job_key,source_fingerprint,state,
     payload_json,payload_sha256,embeddings_sha256)
 SELECT ?,?,?,?,?,'embedded',?,?,?
 WHERE ${activeLeaseSql} ${DOCUMENT_STAGING_EPOCH_FENCE_SQL}
 AND NOT EXISTS(SELECT 1 FROM ingestion_v2_publications
   WHERE document_id=?)
 ON CONFLICT(document_id,staging_epoch,revision) DO UPDATE
 SET state=ingestion_v2_map_revision_candidates.state
 WHERE ingestion_v2_map_revision_candidates.job_key=excluded.job_key
  AND ingestion_v2_map_revision_candidates.source_fingerprint=excluded.source_fingerprint
  AND ingestion_v2_map_revision_candidates.payload_sha256=excluded.payload_sha256
  AND ingestion_v2_map_revision_candidates.payload_json=excluded.payload_json
  AND ingestion_v2_map_revision_candidates.embeddings_sha256=excluded.embeddings_sha256
 RETURNING payload_sha256`,
 [...root(s),s.jobKey,s.fingerprint,checked.json,checked.hash,embeddingsSha,
 ...fence(lease,s,now),s.documentId]);
 if(inserted?.payload_sha256!==checked.hash)
   fail("CANDIDATE_STALE_OR_CONFLICT");
 // A crash between individual receipts is safe: candidate prevents fallback.
 for(const e of payload.entries){
   const observed=await Promise.all(indexes.map(i=>i.getByIds([e.stagedId])));
   if(!observed.every(v=>activeVector(v,e,s)))fail("INDEX_CHANGED");
   const at=Date.now();
   const receipt=await q(db,`INSERT INTO ingestion_v2_map_revision_receipts
     (document_id,staging_epoch,revision,logical_id,staged_id,
       source_fingerprint,created_at_ms)
     SELECT ?,?,?,?,?,?,?
     WHERE ${activeLeaseSql} ${DOCUMENT_STAGING_EPOCH_FENCE_SQL}
       AND EXISTS(SELECT 1 FROM ingestion_v2_map_revision_candidates c
        WHERE c.document_id=? AND c.staging_epoch=? AND c.revision=?
          AND c.source_fingerprint=? AND c.payload_sha256=?
          AND c.state='embedded')
     ON CONFLICT(document_id,staging_epoch,revision,logical_id) DO UPDATE
       SET created_at_ms=ingestion_v2_map_revision_receipts.created_at_ms
       WHERE ingestion_v2_map_revision_receipts.staged_id=excluded.staged_id
         AND ingestion_v2_map_revision_receipts.source_fingerprint=excluded.source_fingerprint
     RETURNING staged_id`,
     [...root(s),e.logicalId,e.stagedId,s.fingerprint,at,
      ...fence(lease,s,at),...root(s),s.fingerprint,checked.hash]);
   if(receipt?.staged_id!==e.stagedId)fail("RECEIPT_STALE_OR_CONFLICT");
 }
}
type Proof={
 payload:MapRevisionPayload;rawIds:string[];evidenceIds:string[];
 manifest:string;
};
async function manifestProof(db:CoordinatorDB,s:MapRevisionScope,
 indexes:readonly [ImmutableIndex,ImmutableIndex]):Promise<Proof|null>{
 if(!await liveSource(db,s))return null;
 const c=await getCandidate(db,s);
 if(!c)return null;
 const raw=await rows(db,`SELECT staged_id FROM ingestion_v2_vector_receipts
 WHERE document_id=? AND generation=? AND source_fingerprint=? AND layer='raw'
 ORDER BY staged_id`,[s.documentId,s.epoch,s.fingerprint]);
 const ev=await rows(db,`SELECT logical_id FROM ingestion_v2_staged_evidence
 WHERE document_id=? AND generation=? AND source_fingerprint=?
 ORDER BY logical_id`,[s.documentId,s.epoch,s.fingerprint]);
 if(raw.length<1||raw.length>4096||ev.length<1||ev.length>4096||
    new Set(raw.map(x=>x.staged_id)).size!==raw.length||
    new Set(ev.map(x=>x.logical_id)).size!==ev.length)
   return null;
 const rec=await rows(db,`SELECT logical_id,staged_id,source_fingerprint
 FROM ingestion_v2_map_revision_receipts
 WHERE document_id=? AND staging_epoch=? AND revision=?`,
 root(s));
 if(rec.length!==c.payload.entries.length)return null;
 const expected=new Map(c.payload.entries.map(e=>[e.logicalId,e.stagedId]));
 if(rec.some(x=>!expected.has(String(x.logical_id))||
      expected.get(String(x.logical_id))!==x.staged_id||
      x.source_fingerprint!==s.fingerprint))return null;
 for(const entry of c.payload.entries){
  const pair=await Promise.all(indexes.map(i=>i.getByIds([entry.stagedId])));
  if(!pair.every(v=>activeVector(v,entry,s)))return null;
 }
 const rawIds=raw.map(x=>String(x.staged_id));
 const evidenceIds=ev.map(x=>String(x.logical_id));
 const manifest=digest(["generic-map-revision-v1",s.documentId,
   s.epoch,s.revision,s.fingerprint,c.row.payload_sha256,
   c.row.embeddings_sha256,c.payload.entries.map(e=>e.stagedId),
   rawIds,evidenceIds]);
 return {payload:c.payload,rawIds,evidenceIds,manifest};
}
/** Atomically activate an existing, fully attested revision with one D1 CAS.
 * The only visibility switch is this new table's active row.
 * Existing ingestion_v2_publications is NEVER overwritten by this preview.
 */
export async function activateGenericMapRevisionPreview(
 db:CoordinatorDB,lease:ArchiveLease,s:MapRevisionScope,
 indexes:readonly [ImmutableIndex,ImmutableIndex],
 now=Date.now(),
):Promise<boolean>{
 scope(s,lease);
 const proof=await manifestProof(db,s,indexes);
 if(!proof)return false;
 const c=await getCandidate(db,s);
 if(!c)return false;
 const mapIds=proof.payload.entries.map(e=>e.stagedId);
 const sql=`INSERT INTO ingestion_v2_map_revision_activations
 (document_id,job_key,staging_epoch,revision,source_fingerprint,state,
   manifest_sha256,raw_count,evidence_count,map_count,activated_at_ms)
 SELECT ?,?,?,?,?,'active',?,?,?,?,?
 WHERE ${activeLeaseSql} ${DOCUMENT_STAGING_EPOCH_FENCE_SQL}
 AND NOT EXISTS(SELECT 1 FROM ingestion_v2_publications WHERE document_id=?)
 AND EXISTS(SELECT 1 FROM ingestion_v2_map_revision_candidates c
  WHERE c.document_id=? AND c.staging_epoch=? AND c.revision=?
   AND c.job_key=? AND c.source_fingerprint=? AND c.state='embedded'
   AND c.payload_sha256=? AND c.embeddings_sha256=?)
 AND (SELECT COUNT(*) FROM ingestion_v2_vector_receipts v
  WHERE v.document_id=? AND v.generation=? AND v.layer='raw'
    AND v.source_fingerprint=?)=?
 AND NOT EXISTS(SELECT 1 FROM ingestion_v2_vector_receipts v
  WHERE v.document_id=? AND v.generation=? AND v.layer='raw'
    AND v.source_fingerprint=?
    AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE j.value=v.staged_id))
 AND (SELECT COUNT(*) FROM ingestion_v2_staged_evidence e
  WHERE e.document_id=? AND e.generation=? AND e.source_fingerprint=?)=?
 AND NOT EXISTS(SELECT 1 FROM ingestion_v2_staged_evidence e
  WHERE e.document_id=? AND e.generation=? AND e.source_fingerprint=?
    AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE j.value=e.logical_id))
 AND (SELECT COUNT(*) FROM ingestion_v2_map_revision_receipts r
  WHERE r.document_id=? AND r.staging_epoch=? AND r.revision=?
    AND r.source_fingerprint=?)=?
 AND NOT EXISTS(SELECT 1 FROM ingestion_v2_map_revision_receipts r
  WHERE r.document_id=? AND r.staging_epoch=? AND r.revision=?
    AND (r.source_fingerprint<>?
      OR NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE j.value=r.staged_id)))
 ON CONFLICT(document_id) DO UPDATE SET
  state='active',activated_at_ms=excluded.activated_at_ms
 WHERE ingestion_v2_map_revision_activations.job_key=excluded.job_key
   AND ingestion_v2_map_revision_activations.staging_epoch=excluded.staging_epoch
   AND ingestion_v2_map_revision_activations.revision=excluded.revision
   AND ingestion_v2_map_revision_activations.source_fingerprint=excluded.source_fingerprint
   AND ingestion_v2_map_revision_activations.manifest_sha256=excluded.manifest_sha256
 RETURNING manifest_sha256`;
 const params:unknown[]=[s.documentId,s.jobKey,s.epoch,s.revision,
   s.fingerprint,proof.manifest,proof.rawIds.length,proof.evidenceIds.length,
   mapIds.length,now,
   ...fence(lease,s,now),s.documentId,
   ...root(s),s.jobKey,s.fingerprint,
   c.row.payload_sha256,c.row.embeddings_sha256,
   s.documentId,s.epoch,s.fingerprint,proof.rawIds.length,
   s.documentId,s.epoch,s.fingerprint,JSON.stringify(proof.rawIds),
   s.documentId,s.epoch,s.fingerprint,proof.evidenceIds.length,
   s.documentId,s.epoch,s.fingerprint,JSON.stringify(proof.evidenceIds),
   ...root(s),s.fingerprint,mapIds.length,
   ...root(s),s.fingerprint,JSON.stringify(mapIds)];
 const active=await q(db,sql,params);
 return active?.manifest_sha256===proof.manifest;
}
/** Offline rollback of one revision pointer. The candidate remains, so
 * legacy RAW/Map fallback is permanently DENIED for that document until a
 * reviewed migration / activation resolves it. No vectors are deleted.
 */
export async function blockGenericMapRevisionPreview(
 db:CoordinatorDB,lease:ArchiveLease,s:MapRevisionScope,
 now=Date.now(),
):Promise<boolean>{
 scope(s,lease);
 const row=await q(db,`UPDATE ingestion_v2_map_revision_activations
  SET state='blocked'
  WHERE document_id=? AND job_key=? AND staging_epoch=? AND revision=?
    AND source_fingerprint=? AND state='active'
    AND ${activeLeaseSql} ${DOCUMENT_STAGING_EPOCH_FENCE_SQL}
  RETURNING state`,
 [s.documentId,s.jobKey,s.epoch,s.revision,s.fingerprint,
  ...fence(lease,s,now)]);
 return row?.state==="blocked";
}
const fetchActiveSQL=`SELECT a.*,c.payload_json,c.payload_sha256,c.embeddings_sha256
 FROM ingestion_v2_map_revision_activations a
 JOIN ingestion_v2_map_revision_candidates c
  ON c.document_id=a.document_id AND c.staging_epoch=a.staging_epoch
   AND c.revision=a.revision AND c.job_key=a.job_key
   AND c.source_fingerprint=a.source_fingerprint
 JOIN ingestion_v2_document_epochs e
  ON e.document_id=a.document_id AND e.job_key=a.job_key
   AND e.staging_epoch=a.staging_epoch
   AND e.source_fingerprint=a.source_fingerprint
 WHERE a.document_id=? AND a.state='active' AND c.state='embedded'
   AND NOT EXISTS(SELECT 1 FROM ingestion_v2_publications
     WHERE document_id=a.document_id)`;
async function activeForDoc(db:CoordinatorDB,doc:string,
 indexes:readonly [ImmutableIndex,ImmutableIndex]){
 const a=await q(db,fetchActiveSQL,[doc]);
 if(!a)return null;
 const s:MapRevisionScope={documentId:doc,jobKey:String(a.job_key),
   epoch:Number(a.staging_epoch),revision:Number(a.revision),
   fingerprint:String(a.source_fingerprint)};
 // Manifest proof must match both the D1 pointer and the live source state.
 const proof=await manifestProof(db,s,indexes);
 if(!proof||proof.manifest!==a.manifest_sha256||
    a.map_count!==proof.payload.entries.length||
    a.raw_count!==proof.rawIds.length||
    a.evidence_count!==proof.evidenceIds.length)return null;
 // The activation can be blocked (or the document source replaced) while
 // asynchronous Vectorize readback is in flight. Recheck the authoritative
 // D1 pointer + current source AFTER that readback, not only before it.
 // A rollback during readback must never return a stale approved result.
 const current=await q(db,fetchActiveSQL,[doc]);
 if(!current||
    current.job_key!==a.job_key||
    current.staging_epoch!==a.staging_epoch||
    current.revision!==a.revision||
    current.source_fingerprint!==a.source_fingerprint||
    current.manifest_sha256!==a.manifest_sha256||
    current.map_count!==a.map_count||
    current.raw_count!==a.raw_count||
    current.evidence_count!==a.evidence_count)return null;
 return {scope:s,proof};
}
/** READ-SIDE PROOF, not connected to Production APIs.
 * A: legacy published immutable state (no revision candidates) remains valid.
 * B: any revision candidate permanently blocks legacy fallback unless an
 * exact active revision passes full D1/dual-index checks. Outage => [].
 */
export async function filterGenericPublishedMapPreview<T extends VectorMatch>(
 db:CoordinatorDB|undefined,matches:T[],
 indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<T[]>{
 if(!db?.prepare||!Array.isArray(matches)||indexes?.length!==2)return [];
 try{
  const groups=new Map<string,T[]>();
  for(const m of matches){
   const doc=m?.metadata?.sourceFileId;
   if(typeof doc!=="string"||doc.length<1)continue;
   groups.set(doc,[...(groups.get(doc)||[]),m]);
  }
  const approved=new Set<T>();
  for(const [doc,hits] of groups){
   const any=await q(db,`SELECT 1 AS present FROM
     ingestion_v2_map_revision_candidates WHERE document_id=? LIMIT 1`,[doc]);
   if(!any){
    const published=await q(db,`SELECT 1 AS published FROM
      ingestion_v2_publications WHERE document_id=?`,[doc]);
    if(!published)continue; // never allow unpublished legacy fallback
    const old=await filterVisibleImmutableVectors(db,hits,false);
    for(const hit of old){
      if(parseImmutableVectorId(hit.id)?.layer==="map")approved.add(hit);
    }
    continue;
   }
   const active=await activeForDoc(db,doc,indexes);
   if(!active)continue;
   const allowed=new Map(active.proof.payload.entries.map(e=>[e.stagedId,e]));
   const seen=new Set<string>();
   for(const hit of hits){
    const e=allowed.get(hit.id);
    if(!e||seen.has(hit.id)||!activeVector(
      [{id:hit.id,metadata:hit.metadata}],e,active.scope))continue;
    seen.add(hit.id);approved.add(hit);
   }
  }
  // Preserve search relevance ordering across mixed legacy/new documents.
  // Track the exact approved object, never treat a forged duplicate with the
  // same ID as equivalent to an approved candidate.
  const emitted=new Set<string>();
  return matches.filter(hit=>{
    if(!approved.has(hit)||emitted.has(hit.id))return false;
    emitted.add(hit.id);return true;
  });
 }catch{return []}
}

/** Preview of version-aware RAW visibility. A non-revisioned, already
 * published A document retains the existing immutable receipt semantics.
 * Revisioned B requires an intact active Map pointer BEFORE its RAW may
 * appear, then exact old RAW receipts and readback in both indexes.
 */
export async function filterGenericPublishedRawPreview<T extends VectorMatch>(
 db:CoordinatorDB|undefined,matches:T[],
 indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<T[]>{
 if(!db?.prepare||!Array.isArray(matches)||indexes?.length!==2)return [];
 try{
  const accepted=new Set<T>();
  const docs=new Map<string,T[]>();
  for(const m of matches){
   const doc=m?.metadata?.sourceFileId;
   if(typeof doc!=="string"||doc.length<1)continue;
   docs.set(doc,[...(docs.get(doc)||[]),m]);
  }
  for(const [doc,hits] of docs){
   const candidate=await q(db,`SELECT 1 AS present FROM
    ingestion_v2_map_revision_candidates WHERE document_id=? LIMIT 1`,[doc]);
   if(!candidate){
    const pub=await q(db,`SELECT 1 AS present FROM
     ingestion_v2_publications WHERE document_id=?`,[doc]);
    if(!pub)continue;
    const old=await filterVisibleImmutableVectors(db,hits,false);
    for(const hit of old){
      if(parseImmutableVectorId(hit.id)?.layer==="raw")accepted.add(hit);
    }
    continue;
   }
   const active=await activeForDoc(db,doc,indexes);
   if(!active)continue;
   const allowed=new Set(active.proof.rawIds);
   for(const hit of hits){
    const meta=hit.metadata||{},parts=parseImmutableVectorId(hit.id);
    if(!allowed.has(hit.id)||parts?.layer!=="raw"||
       parts.generation!==active.scope.epoch||
       meta.sourceFileId!==doc||
       meta.sourceFingerprint!==active.scope.fingerprint||
       meta.stagedGeneration!==active.scope.epoch||
       meta.stagedLayer!=="raw"||meta.status!=="active"||
       meta.contentType==="document-map"||
       typeof meta.text!=="string"||!meta.text||
       !Number.isSafeInteger(meta.page)||Number(meta.page)<1||
       !Number.isSafeInteger(meta.chunkIndex)||
       Number(meta.chunkIndex)<0)continue;
    const receipt=await q(db,`SELECT staged_id FROM ingestion_v2_vector_receipts
     WHERE document_id=? AND generation=? AND layer='raw'
       AND source_fingerprint=? AND staged_id=?`,[
       doc,active.scope.epoch,active.scope.fingerprint,hit.id]);
    if(receipt?.staged_id!==hit.id)continue;
    const pair=await Promise.all(indexes.map(i=>i.getByIds([hit.id])));
    if(pair.some(v=>!Array.isArray(v)||v.length!==1||
       v[0]?.id!==hit.id||
       v[0]?.metadata?.text!==meta.text||
       v[0]?.metadata?.page!==meta.page||
       v[0]?.metadata?.chunkIndex!==meta.chunkIndex||
       v[0]?.metadata?.fileName!==meta.fileName||
       v[0]?.metadata?.sourcePath!==meta.sourcePath||
       v[0]?.metadata?.sourceFileId!==doc||
       v[0]?.metadata?.sourceFingerprint!==active.scope.fingerprint||
       v[0]?.metadata?.stagedGeneration!==active.scope.epoch||
       v[0]?.metadata?.stagedLayer!=="raw"||
       v[0]?.metadata?.status!=="active"))continue;
    accepted.add(hit);
   }
  }
  const seen=new Set<string>();
  return matches.filter(v=>{
   if(!accepted.has(v)||seen.has(v.id))return false;
   seen.add(v.id);return true;
  });
 }catch{return []}
}
export type GenericExactEvidence={
 logicalId:string;text:string;fileName:string;sourcePath:string;
 page:number;chunkIndex:number;sourceFingerprint:string;
};
/**
 * Exact-ID Evidence proof for identifier/section lookup. The earlier preview
 * took the first 250 page-ordered rows before matching IDs; that could hide a
 * valid reference on page 251+. Here we attest the complete active revision,
 * then fetch ONLY the requested ≤100 bounded logical IDs.
 *
 * No unactivated B candidate can fall back to older Evidence; stale index
 * or a pointer blocked during async reads returns [].
 */
export async function readGenericPublishedEvidenceByIds(
 db:CoordinatorDB|undefined,doc:string,logicalIds:string[],
 indexes:readonly [ImmutableIndex,ImmutableIndex],
):Promise<GenericExactEvidence[]>{
 if(!db?.prepare||typeof doc!=="string"||!doc||
    !Array.isArray(logicalIds)||logicalIds.length<1||
    logicalIds.length>100||indexes?.length!==2||
    indexes.some(i=>typeof i?.getByIds!=="function"))return [];
 const ids=[...new Set(logicalIds)];
 if(ids.some(x=>typeof x!=="string"||x.length<1||x.length>180))
   return [];
 try{
  // Only new revision candidates use this path. Legacy A continues through
  // its dedicated published V2 Evidence lookup.
  const candidate=await q(db,`SELECT 1 AS present
    FROM ingestion_v2_map_revision_candidates
    WHERE document_id=? LIMIT 1`,[doc]);
  if(!candidate)return [];
  const active=await activeForDoc(db,doc,indexes);
  if(!active)return [];
  const sql=`SELECT e.logical_id,e.text,e.file_name,e.source_path,
    e.page,e.chunk_index,e.source_fingerprint
    FROM ingestion_v2_staged_evidence e
    JOIN ingestion_v2_map_revision_activations a
      ON a.document_id=e.document_id
       AND a.staging_epoch=e.generation
       AND a.source_fingerprint=e.source_fingerprint
       AND a.state='active'
    JOIN ingestion_v2_document_epochs d
      ON d.document_id=a.document_id AND d.job_key=a.job_key
       AND d.staging_epoch=a.staging_epoch
       AND d.source_fingerprint=a.source_fingerprint
    WHERE e.document_id=? AND e.logical_id IN (${ids.map(()=>"?").join(",")})
    ORDER BY e.page,e.chunk_index LIMIT ?`;
  const selected=await rows(db,sql,[doc,...ids,ids.length]);
  if(selected.length>ids.length)return [];
  const allowed=new Set(active.proof.evidenceIds);
  if(selected.some(e=>!allowed.has(String(e.logical_id))||
     typeof e.text!=="string"||!e.text||
     typeof e.file_name!=="string"||typeof e.source_path!=="string"||
     !Number.isSafeInteger(e.page)||Number(e.page)<1||
     !Number.isSafeInteger(e.chunk_index)||Number(e.chunk_index)<0||
     e.source_fingerprint!==active.scope.fingerprint))return [];
  // Close rollback/replacement races during the exact-ID D1 query.
  const again=await activeForDoc(db,doc,indexes);
  if(!again||again.scope.epoch!==active.scope.epoch||
     again.scope.revision!==active.scope.revision||
     again.scope.fingerprint!==active.scope.fingerprint||
     again.proof.manifest!==active.proof.manifest)return [];
  return selected.map(e=>({
   logicalId:String(e.logical_id),text:String(e.text),
   fileName:String(e.file_name),sourcePath:String(e.source_path),
   page:Number(e.page),chunkIndex:Number(e.chunk_index),
   sourceFingerprint:String(e.source_fingerprint),
  }));
 }catch{return []}
}

/** Evidence page citations use the SAME active source epoch and B pointer.
 * Never allow a revision candidate with a missing/blocked activation to
 * fall back to stale evidence, while legacy published A stays supported.
 */
export async function readGenericPublishedEvidencePreview(
 db:CoordinatorDB|undefined,doc:string,
 indexes:readonly [ImmutableIndex,ImmutableIndex],limit=100,
):Promise<GenericExactEvidence[]>{
 if(!db?.prepare||typeof doc!=="string"||!doc||
    !Number.isSafeInteger(limit)||limit<1||limit>250||
    indexes?.length!==2)return [];
 try{
  const candidate=await q(db,`SELECT 1 AS present
   FROM ingestion_v2_map_revision_candidates WHERE document_id=? LIMIT 1`,[doc]);
  let sql:string,args:unknown[];
  if(candidate){
   const active=await activeForDoc(db,doc,indexes);
   if(!active)return [];
   sql=`SELECT e.logical_id,e.text,e.file_name,e.source_path,
     e.page,e.chunk_index,e.source_fingerprint
    FROM ingestion_v2_staged_evidence e
    JOIN ingestion_v2_map_revision_activations p
      ON p.document_id=e.document_id
       AND p.staging_epoch=e.generation
       AND p.source_fingerprint=e.source_fingerprint
       AND p.state='active'
    JOIN ingestion_v2_document_epochs d
      ON d.document_id=e.document_id AND d.job_key=p.job_key
       AND d.staging_epoch=p.staging_epoch
       AND d.source_fingerprint=p.source_fingerprint
    WHERE e.document_id=?
    ORDER BY e.page,e.chunk_index LIMIT ?`;
   args=[doc,limit];
  }else{
   // Older published A documents have no revision candidate and are read
   // strictly via the EXISTING D1 generation publication (never unpub).
   sql=`SELECT e.logical_id,e.text,e.file_name,e.source_path,
     e.page,e.chunk_index,e.source_fingerprint
    FROM ingestion_v2_staged_evidence e JOIN ingestion_v2_publications p
       ON p.document_id=e.document_id
        AND p.active_generation=e.generation
        AND p.source_fingerprint=e.source_fingerprint
    WHERE e.document_id=?
    ORDER BY e.page,e.chunk_index LIMIT ?`;
   args=[doc,limit];
  }
  const evidence=await rows(db,sql,args);
  if(evidence.some(e=>typeof e.logical_id!=="string"||
    typeof e.text!=="string"||!e.text||
    typeof e.file_name!=="string"||typeof e.source_path!=="string"||
    !Number.isSafeInteger(e.page)||Number(e.page)<1||
    !Number.isSafeInteger(e.chunk_index)||Number(e.chunk_index)<0))
   return [];
  return evidence.map(e=>({
   logicalId:String(e.logical_id),text:String(e.text),
   fileName:String(e.file_name),sourcePath:String(e.source_path),
   page:Number(e.page),chunkIndex:Number(e.chunk_index),
   sourceFingerprint:String(e.source_fingerprint),
  }));
 }catch{return []}
}
