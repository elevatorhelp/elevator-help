/**
 * Issue #106 strict two-worker REAL PDF QA allowlist (never Production).
 * Each independent root-scoped D1 job can touch only one fixed PDF.
 */
export const QA106_ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
export const QA106_CONFIRM="QA_ONLY_TWO_PDFS_MAX_24_GEMINI_CALLS";
export const QA106_PDFS=Object.freeze({
  A:"1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v",
  B:"1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn",
});
export const QA106_PORTS=Object.freeze({A:"8787",B:"8788"});
export function qa106JobKey(slot){
  if(slot!=="A"&&slot!=="B")throw Error("QA106_UNKNOWN_WORKER");
  return "drive:"+QA106_ROOT+"_qa_"+slot;
}
export function assertQa106ParallelContext(env){
  if(env.INGESTION_V2_QA_PARALLEL_MODE!=="true"){
    if(env.INGESTION_V2_QA_PARALLEL_SLOT!==undefined||
       env.INGESTION_V2_QA_PARALLEL_FILE_ID!==undefined||
       env.INGESTION_V2_QA_PARALLEL_CONFIRMATION!==undefined)
      throw Error("QA106_UNAPPROVED_PARALLEL_FLAGS");
    return null;
  }
  const slot=env.INGESTION_V2_QA_PARALLEL_SLOT;
  if(slot!=="A"&&slot!=="B")throw Error("QA106_UNKNOWN_WORKER");
  const documentId=QA106_PDFS[slot];
  const jobKey=qa106JobKey(slot);
  if(env.INGESTION_V2_QA_MODE!=="true"||
     env.INGESTION_D1_COORDINATOR_MODE!=="strict"||
     env.GITHUB_ACTIONS!=="true"||
     env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
     env.GITHUB_REF!=="refs/heads/main"||
     env.INGESTION_D1_EXPLICIT_RUN_ID!==env.GITHUB_RUN_ID||
     !/^[1-9][0-9]{5,19}$/.test(env.GITHUB_RUN_ID||"")||
     env.DRIVE_FOLDER_ID!==QA106_ROOT||
     env.INGESTION_V2_QA_DRIVE_ROOT!==QA106_ROOT||
     env.INGESTION_V2_QA_PARALLEL_CONFIRMATION!==QA106_CONFIRM||
     env.INGESTION_V2_QA_PARALLEL_FILE_ID!==documentId||
     env.QA_V2_JOB_KEY!==jobKey||
     env.INGESTION_V2_QA_ORIGIN!=="http://127.0.0.1:"+QA106_PORTS[slot]||
     env.TARGET_FILE_ID!==undefined||
     env.ARCHIVE_SHARD_INDEX!==undefined||
     env.ARCHIVE_SHARD_COUNT!==undefined||
     env.FORCE_REINGEST==="true"||
     env.INGESTION_D1_BOOTSTRAP_APPROVED==="true"||
     Number(env.MAX_FILES)!==1||
     !Number.isInteger(Number(env.MAX_GEMINI_CALLS))||
     Number(env.MAX_GEMINI_CALLS)<1||
     Number(env.MAX_GEMINI_CALLS)>4)
    throw Error("QA106_UNAPPROVED_PARALLEL_EXECUTION");
  return {slot,documentId,jobKey};
}
