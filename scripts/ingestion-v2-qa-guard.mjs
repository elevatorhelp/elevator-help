/**
 * Safety/manifest contracts for the real Google Drive immutable V2 QA path.
 * Pure helpers: no access to Google, Gemini, D1, Vectorize or Production.
 */
const MAX_MANIFEST_ENTRIES=4096;
const STAGED_ID=/^v2[rm]-[1-9a-z][0-9a-z]*-[a-f0-9]{40}$/;

export function assertManualQaV2Environment(env){
  if(env.INGESTION_V2_QA_MODE!=="true"||
     env.INGESTION_D1_COORDINATOR_MODE!=="strict"||
     env.GITHUB_ACTIONS!=="true"||
     env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
     !/^[1-9][0-9]{5,19}$/.test(env.GITHUB_RUN_ID||"")||
     env.INGESTION_D1_EXPLICIT_RUN_ID!==env.GITHUB_RUN_ID||
     env.ARCHIVE_SHARD_INDEX!==undefined ||
     env.ARCHIVE_SHARD_COUNT!==undefined ||
     env.FORCE_REINGEST==="true" ||
     !!env.TARGET_FILE_ID ||
     env.INGESTION_D1_BOOTSTRAP_APPROVED==="true")
    throw Error("V2_QA_UNAPPROVED_EXECUTION");

  const provided=env.INGESTION_V2_QA_ORIGIN;
  if(typeof provided!=="string")throw Error("V2_QA_ORIGIN_REQUIRED");
  let url;
  try{url=new URL(provided);}catch{throw Error("V2_QA_INVALID_ORIGIN");}
  const loopback=url.protocol==="http:" &&
    (url.hostname==="127.0.0.1"||url.hostname==="localhost") &&
    /^[1-9][0-9]{1,4}$/.test(url.port);
  const dedicatedRemote=url.protocol==="https:"&&
    /^[a-z0-9-]*qa[a-z0-9-]*\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname);
  if((!loopback&&!dedicatedRemote)||url.username||url.password||
     url.pathname!=="/"||url.search||url.hash)
    throw Error("V2_QA_INVALID_ORIGIN");

  const origin=url.origin;
  for(const [name,suffix] of [
    ["INGEST_ENDPOINT","/api/drive-ingest-batch"],
    ["DOCUMENT_MAP_ENDPOINT","/api/document-map-ingest"],
    ["INGESTION_COORDINATOR_ENDPOINT","/api/ingestion-coordinator"],
    ["INGESTION_IMMUTABLE_ENDPOINT","/api/immutable-archive-publish"]
  ]){
    if(env[name]!==origin+suffix)throw Error("V2_QA_ENDPOINT_MISMATCH");
  }
  // QA must never bulk-copy confidential customer documents from the live
  // default Drive root into an isolated test index.
  const productionRoot="1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
  if(!/^[a-zA-Z0-9_-]{10,128}$/.test(env.DRIVE_FOLDER_ID||"") ||
     env.DRIVE_FOLDER_ID===productionRoot ||
     env.INGESTION_V2_QA_DRIVE_ROOT!==env.DRIVE_FOLDER_ID)
    throw Error("V2_QA_SEPARATE_DRIVE_FIXTURE_REQUIRED");
  if(!Number.isSafeInteger(Number(env.MAX_FILES))||
     Number(env.MAX_FILES)<1||Number(env.MAX_FILES)>2)
    throw Error("V2_QA_UNBOUNDED_DOCUMENTS");
  if(!Number.isSafeInteger(Number(env.MAX_GEMINI_CALLS))||
     Number(env.MAX_GEMINI_CALLS)<1||Number(env.MAX_GEMINI_CALLS)>12)
    throw Error("V2_QA_UNBOUNDED_GEMINI");
  return origin;
}

function validIds(ids,kind){
  if(!Array.isArray(ids)||ids.length<1||ids.length>MAX_MANIFEST_ENTRIES||
     new Set(ids).size!==ids.length)return false;
  return ids.every(id=>typeof id==="string"&&id.length>0&&id.length<=320&&
    (kind==="evidence" || STAGED_ID.test(id)));
}

export function attachDocumentEpoch(record,epoch){
  if(!Number.isSafeInteger(epoch)||epoch<1)throw Error("V2_QA_INVALID_EPOCH");
  if(record.documentEpoch!==undefined && record.documentEpoch!==epoch)
    throw Error("V2_QA_DOCUMENT_EPOCH_CHANGED");
  record.documentEpoch=epoch;
  return epoch;
}

export function verifyV2StageBatch(result,expected,layer,record){
  if(!result||result.ok!==true||result.published!==false||
     !Array.isArray(result.stagedIds)||
     result.stagedIds.length!==expected.length||
     !validIds(result.stagedIds,layer)|| 
     !Number.isSafeInteger(result.documentEpoch))
    throw Error("V2_QA_INVALID_STAGE_RECEIPT");
  if(layer==="evidence" || (layer!=="raw" && layer!=="map"))
    throw Error("V2_QA_INVALID_VECTOR_LAYER");
  attachDocumentEpoch(record,result.documentEpoch);
  return result.stagedIds;
}

export function verifyV2EvidenceReceipt(result,logicalId,record){
  if(!result||result.ok!==true||result.staged!==true||
    result.published!==false||result.documentEpoch===undefined)
    throw Error("V2_QA_INVALID_EVIDENCE_RECEIPT");
  attachDocumentEpoch(record,result.documentEpoch);
  if(typeof logicalId!=="string"||!logicalId||logicalId.length>320)
    throw Error("V2_QA_INVALID_EVIDENCE_ID");
  return logicalId;
}

export function buildQaImmutableManifest(record,sourceFingerprint){
  if(!record||typeof record!=="object"||
     typeof sourceFingerprint!=="string"||
     sourceFingerprint.length<1||sourceFingerprint.length>256 ||
     record.evidenceFingerprint!==sourceFingerprint||
     record.rawFingerprint!==sourceFingerprint||
     record.mapFingerprint!==sourceFingerprint||
     record.extractionQuality?.status!=="text_layer_complete"||
     !Number.isSafeInteger(record.documentEpoch)||
     !validIds(record.evidenceIds,"evidence")||
     !validIds(record.ids,"raw")||
     !validIds(record.mapIds,"map"))
    return null;
  return {
    sourceFingerprint,
    evidenceIds:[...record.evidenceIds],
    rawIds:[...record.ids],
    mapIds:[...record.mapIds],
  };
}

export function assertQaImmutablePublish(receipt,expectedEpoch){
  if(receipt?.ok!==true||receipt.published!==true||
     receipt.generation!==expectedEpoch)
    throw Error("V2_QA_PUBLICATION_NOT_VERIFIED");
}

export function updateQaDeletionCandidate(record,seenMissing){
  if(!seenMissing)return {...record,missingScanCount:0,tombstonePending:false};
  const count=Math.min(2,Math.max(0,record?.missingScanCount||0)+1);
  return {...record,missingScanCount:count,tombstonePending:count>=2};
}
