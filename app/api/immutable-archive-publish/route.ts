/**
 * Private QA-first staging & one-shot publish endpoint.
 * Disabled by default, and entirely separate from the existing serial writer.
 * DO NOT enable until every retrieval path enforces published-generation D1.
 */
import {getCloudflareContext} from "@opennextjs/cloudflare";
import {NextResponse} from "next/server";
import {timingSafeEqual,createHash} from "node:crypto";
import {
  stageImmutableVectorPair,stageImmutableExactEvidence,
  publishImmutableThreeLayerGeneration,validateFullImmutableManifest,
  type ImmutableIndex,type ImmutableStagedVector,type ExactEvidence,
  type PublicationManifest,type PublicationLayer,
} from "../../lib/ingestion-immutable-publication";
import {
  makeGlobalArchiveWriteGuard,GlobalArchiveWriteDenied,
} from "../../lib/ingestion-global-write-gate";
import type {ArchiveLease,CoordinatorDB} from "../../lib/ingestion-global-coordinator";
import {stageImmutableEvidenceReferenceTerms} from "../../lib/ingestion-v2-evidence-references";
import {claimDocumentStagingEpoch} from "../../lib/ingestion-document-staging-epoch";

export const dynamic="force-dynamic";
const opts={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
const json=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers:opts});
const MAX_REQUEST_BYTES=1_400_000;

function authorized(auth:string,expected:string|undefined):boolean{
  if(typeof expected!=="string"||expected.length<24)return false;
  const a=Buffer.from(auth,"utf8"),b=Buffer.from("Bearer "+expected,"utf8");
  return a.length===b.length&&timingSafeEqual(a,b);
}
function safeError(error:unknown):{code:string;status:number}{
  if(error instanceof GlobalArchiveWriteDenied)return {code:error.code,status:409};
  const msg=error instanceof Error?error.message:"";
  if(/^INVALID_|^STAGED_VECTOR_ID_TOO_LONG$/.test(msg))
    return {code:"INVALID_IMMUTABLE_REQUEST",status:400};
  if(/^(STAGED_DUAL_VECTOR_READBACK_NOT_READY|STAGED_VECTOR_RECEIPT_DENIED|IMMUTABLE_STAGE_LEASE_STALE)$/.test(msg))
    return {code:msg,status:409};
  return {code:"IMMUTABLE_PUBLICATION_UNAVAILABLE",status:503};
}
export async function POST(request:Request){
  if(!authorized(request.headers.get("authorization")||"",process.env.INGESTION_TOKEN))
    return json({ok:false,error:"UNAUTHORIZED"},401);
  let env:Record<string,unknown>;
  try {env=getCloudflareContext().env as unknown as Record<string,unknown>;}
  catch{return json({ok:false,error:"RUNTIME_UNAVAILABLE"},503);}
  // Feature is OFF unless all independent owner-controlled flags are on.
  if(env.INGESTION_IMMUTABLE_PUBLICATION_ENABLED!=="true")
    return json({ok:false,error:"IMMUTABLE_PUBLICATION_DISABLED"},404);
  if(env.INGESTION_COORDINATOR_ENABLED!=="true"||
     !/^drive:[A-Za-z0-9_-]{10,128}$/.test(String(env.INGESTION_COORDINATOR_JOB_KEY||""))||
     !env.CORTEX_DB||!env.VECTORIZE||!env.VECTORIZE_V2)
    return json({ok:false,error:"IMMUTABLE_PUBLICATION_NOT_CONFIGURED"},503);
  const claimedSize=Number(request.headers.get("content-length"));
  if(Number.isFinite(claimedSize)&&claimedSize>MAX_REQUEST_BYTES)
    return json({ok:false,error:"REQUEST_TOO_LARGE"},413);
  let data:Record<string,unknown>;
  try{
    const raw=await request.text();
    if(Buffer.byteLength(raw,"utf8")>MAX_REQUEST_BYTES)
      return json({ok:false,error:"REQUEST_TOO_LARGE"},413);
    const parsed=JSON.parse(raw) as unknown;
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
      return json({ok:false,error:"INVALID_REQUEST"},400);
    data=parsed as Record<string,unknown>;
  }catch{return json({ok:false,error:"INVALID_REQUEST"},400);}
  const doc=data.documentId;
  if(typeof doc!=="string"||doc.length>180||doc.trim()==="")
    return json({ok:false,error:"INVALID_DOCUMENT_ID"},400);
  const lease=data.globalArchiveLease as ArchiveLease|undefined;
  const gate=makeGlobalArchiveWriteGuard(
    {...env,INGESTION_GLOBAL_WRITE_GATE_ENABLED:"true"},
    {globalArchiveLease:lease});
  try{
    await gate();
    const db=env.CORTEX_DB as CoordinatorDB;
    const action=data.action;
    if(action==="stage_vector"){
      const layer=data.layer;
      if(layer!=="raw"&&layer!=="map")
        return json({ok:false,error:"INVALID_LAYER"},400);
      const record=data.record as ImmutableStagedVector|undefined;
      if(!record||typeof record!=="object"||Array.isArray(record))
        return json({ok:false,error:"INVALID_VECTOR_RECORD"},400);
      const documentEpoch=await claimDocumentStagingEpoch(
        db,lease!,doc,record.sourceFingerprint);
      if(documentEpoch===null)
        return json({ok:false,error:"DOCUMENT_STAGING_EPOCH_DENIED"},409);
      const stagedId=await stageImmutableVectorPair(
        db,lease!,doc,layer as PublicationLayer,record,
        [env.VECTORIZE as ImmutableIndex,env.VECTORIZE_V2 as ImmutableIndex],
        Date.now(),documentEpoch,
      );
      return json({ok:true,staged:true,published:false,stagedId,documentEpoch});
    }
    if(action==="stage_evidence"){
      const evidence=data.evidence as ExactEvidence|undefined;
      if(!evidence||typeof evidence!=="object"||Array.isArray(evidence))
        return json({ok:false,error:"INVALID_EVIDENCE_RECORD"},400);
      const documentEpoch=await claimDocumentStagingEpoch(
        db,lease!,doc,evidence.sourceFingerprint);
      if(documentEpoch===null)
        return json({ok:false,error:"DOCUMENT_STAGING_EPOCH_DENIED"},409);
      const staged=await stageImmutableExactEvidence(
        db,lease!,doc,evidence,Date.now(),documentEpoch);
      if(!staged)return json({ok:false,error:"EVIDENCE_STAGING_DENIED"},409);
      const terms=await stageImmutableEvidenceReferenceTerms(
        db,lease!,doc,evidence,Date.now(),documentEpoch);
      return json({ok:true,staged:true,published:false,referenceTerms:terms,documentEpoch});
    }
    if(action==="verify_published"){
      const manifest=data.manifest as PublicationManifest|undefined;
      if(!manifest||typeof manifest!=="object"||Array.isArray(manifest))
        return json({ok:false,error:"INVALID_MANIFEST"},400);
      validateFullImmutableManifest(manifest);
      const documentEpoch=await claimDocumentStagingEpoch(
        db,lease!,doc,manifest.sourceFingerprint);
      if(documentEpoch===null)
        return json({ok:false,error:"DOCUMENT_STAGING_EPOCH_DENIED"},409);
      const manifestHash=createHash("sha256")
        .update(JSON.stringify([doc,documentEpoch,manifest]),"utf8").digest("hex");
      const already=await db.prepare(`
        SELECT active_generation AS generation FROM ingestion_v2_publications
        WHERE document_id=? AND job_key=? AND active_generation=?
          AND source_fingerprint=? AND manifest_sha256=?
      `).bind(doc,lease!.jobKey,documentEpoch,
        manifest.sourceFingerprint,manifestHash).first();
      return Number(already?.generation)===documentEpoch
        ?json({ok:true,published:true,generation:documentEpoch})
        :json({ok:false,published:false,error:"PUBLICATION_NOT_VERIFIED"},409);
    }
    if(action==="publish"){
      const manifest=data.manifest as PublicationManifest|undefined;
      if(!manifest||typeof manifest!=="object"||Array.isArray(manifest))
        return json({ok:false,error:"INVALID_MANIFEST"},400);
      const documentEpoch=await claimDocumentStagingEpoch(
        db,lease!,doc,manifest.sourceFingerprint);
      if(documentEpoch===null)
        return json({ok:false,error:"DOCUMENT_STAGING_EPOCH_DENIED"},409);
      const published=await publishImmutableThreeLayerGeneration(
        db,lease!,doc,manifest,Date.now(),documentEpoch);
      return published?json({ok:true,published:true,generation:documentEpoch}):
        json({ok:false,published:false,error:"INCOMPLETE_OR_STALE_PUBLICATION"},409);
    }
    return json({ok:false,error:"UNKNOWN_ACTION"},400);
  }catch(error){
    const safe=safeError(error);
    return json({ok:false,error:safe.code},safe.status);
  }
}
