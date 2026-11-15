/**
 * Issue #104: durable Map window intent before external Vectorize insert.
 *
 * Cloudflare Vectorize visibility is eventually consistent. A paid Gemini
 * stage request can finish both physical inserts yet time out before D1
 * receipt. This immutable, lease/epoch-fenced window intent stores ONLY
 * physical/logical IDs, not model prompts, text, vectors, or credentials.
 *
 * A later run first rechecks the two existing physical indexes. If both
 * match, only missing D1 receipts are committed. If a pair is missing,
 * execution FAILS CLOSED rather than paying Gemini a second time.
 *
 * Feature is solely invoked by default-off V2 QA routes.
 */
import {createHash} from "node:crypto";
import {
  immutableVectorId,attestExistingImmutableVectorPair,
  type ImmutableIndex,
} from "./ingestion-immutable-publication.ts";
import {
  validateArchiveLease,type ArchiveLease,type CoordinatorDB
} from "./ingestion-global-coordinator.ts";
import {
  validateStagingEpoch,DOCUMENT_STAGING_EPOCH_FENCE_SQL
} from "./ingestion-document-staging-epoch.ts";

export type MapWindowPage={page:number;text:string};
export type PendingMapId={logicalId:string;stagedId:string};
export type MapWindowResult =
  |{status:"none"}
  |{status:"pending";mapCount:number;documentEpoch:number}
  |{status:"complete";mapCount:number;documentEpoch:number;stagedIds:string[]};

const ID=/^map-[a-f0-9]{40}$/;
const SHA=/^[a-f0-9]{64}$/;
const MAX_NODES=12;
const MAX_PAGE_TEXT=45000;

function hash(text:string):string{
  return createHash("sha256").update(text,"utf8").digest("hex");
}

export function immutableMapWindowKey(
  documentId:string,sourceFingerprint:string,mapVersion:number,
  pages:MapWindowPage[],
):string{
  if(typeof documentId!=="string"||!documentId.trim()||documentId.length>180||
     typeof sourceFingerprint!=="string"||sourceFingerprint.length<1||
     sourceFingerprint.length>256||
     !Number.isSafeInteger(mapVersion)||mapVersion<1||
     !Array.isArray(pages)||pages.length<1||pages.length>6||
     pages.some(p=>!Number.isSafeInteger(p?.page)||p.page<1||
       typeof p.text!=="string"||p.text.length>MAX_PAGE_TEXT)||
     new Set(pages.map(p=>p.page)).size!==pages.length)
    throw Error("INVALID_QA_MAP_WINDOW");
  return hash(JSON.stringify([documentId,sourceFingerprint,mapVersion,
    pages.map(p=>[p.page,hash(p.text)])]));
}

function exactIds(
  lease:ArchiveLease,documentId:string,sourceFingerprint:string,
  documentEpoch:number,entries:PendingMapId[]
):boolean{
  if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_NODES||
     new Set(entries.map(e=>e?.logicalId)).size!==entries.length||
     new Set(entries.map(e=>e?.stagedId)).size!==entries.length)
    return false;
  return entries.every(e=>e&&ID.test(e.logicalId)&&
    e.stagedId===immutableVectorId(
      lease,documentId,"map",e.logicalId,sourceFingerprint,documentEpoch));
}

export async function registerPendingMapWindow(
  db:CoordinatorDB,lease:ArchiveLease,documentId:string,
  sourceFingerprint:string,documentEpoch:number,windowKey:string,
  mapVersion:number,logicalIds:string[],now=Date.now(),
):Promise<PendingMapId[]>{
  validateArchiveLease(lease);validateStagingEpoch(documentEpoch);
  if(!SHA.test(windowKey)||!Number.isSafeInteger(mapVersion)||mapVersion<1||
     !Number.isSafeInteger(now)||now<=0||
     !Array.isArray(logicalIds)||logicalIds.length<1||logicalIds.length>MAX_NODES||
     logicalIds.some(id=>typeof id!=="string"||!ID.test(id)))
    throw Error("INVALID_QA_PENDING_MAP_INTENT");
  const entries=logicalIds.map(logicalId=>({
    logicalId,stagedId:immutableVectorId(
      lease,documentId,"map",logicalId,sourceFingerprint,documentEpoch),
  }));
  if(!exactIds(lease,documentId,sourceFingerprint,documentEpoch,entries))
    throw Error("INVALID_QA_PENDING_MAP_IDS");
  const idsJson=JSON.stringify(entries);
  const row=await db.prepare(`
    INSERT INTO ingestion_v2_pending_map_windows
    (document_id,job_key,generation,source_fingerprint,window_key,
     map_version,ids_json,created_at_ms)
    SELECT ?,?,?,?,?,?,?,?
    WHERE EXISTS (
      SELECT 1 FROM ingestion_global_leases
      WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    ) ${DOCUMENT_STAGING_EPOCH_FENCE_SQL}
    ON CONFLICT(document_id,generation,window_key) DO UPDATE SET
      created_at_ms=ingestion_v2_pending_map_windows.created_at_ms
    WHERE ingestion_v2_pending_map_windows.job_key=excluded.job_key
      AND ingestion_v2_pending_map_windows.source_fingerprint=excluded.source_fingerprint
      AND ingestion_v2_pending_map_windows.map_version=excluded.map_version
      AND ingestion_v2_pending_map_windows.ids_json=excluded.ids_json
    RETURNING ids_json
  `).bind(documentId,lease.jobKey,documentEpoch,sourceFingerprint,
    windowKey,mapVersion,idsJson,now,
    lease.jobKey,lease.owner,lease.generation,now,
    documentId,lease.jobKey,documentEpoch,sourceFingerprint).first();
  if(row?.ids_json!==idsJson)
    throw Error("V2_MAP_PENDING_INTENT_DENIED");
  return entries;
}

export async function reconcilePendingMapWindow(
  db:CoordinatorDB,lease:ArchiveLease,documentId:string,
  sourceFingerprint:string,documentEpoch:number,windowKey:string,
  mapVersion:number,indices:readonly [ImmutableIndex,ImmutableIndex],
):Promise<MapWindowResult>{
  validateArchiveLease(lease);validateStagingEpoch(documentEpoch);
  if(!SHA.test(windowKey)||!Number.isSafeInteger(mapVersion)||mapVersion<1)
    throw Error("INVALID_QA_PENDING_MAP_LOOKUP");
  const row=await db.prepare(`
    SELECT ids_json FROM ingestion_v2_pending_map_windows
    WHERE document_id=? AND job_key=? AND generation=?
      AND source_fingerprint=? AND window_key=? AND map_version=?
  `).bind(documentId,lease.jobKey,documentEpoch,sourceFingerprint,
    windowKey,mapVersion).first();
  if(!row)return {status:"none"};
  let parsed:unknown;
  try{parsed=JSON.parse(String(row.ids_json));}
  catch{throw Error("V2_MAP_PENDING_INTENT_CORRUPT");}
  if(!exactIds(lease,documentId,sourceFingerprint,documentEpoch,
        parsed as PendingMapId[]))
    throw Error("V2_MAP_PENDING_INTENT_CORRUPT");
  const entries=parsed as PendingMapId[];
  // No external insert, model call, delete, or unversioned vector mutation.
  // Each attestation checks both physical indexes under the CURRENT lease.
  let pending=false;
  for(const entry of entries){
    const visible=await attestExistingImmutableVectorPair(
      db,lease,documentId,"map",entry.logicalId,
      sourceFingerprint,indices,documentEpoch);
    if(!visible)pending=true;
  }
  return pending
    ?{status:"pending",mapCount:entries.length,documentEpoch}
    :{status:"complete",mapCount:entries.length,
      documentEpoch,stagedIds:entries.map(e=>e.stagedId)};
}
