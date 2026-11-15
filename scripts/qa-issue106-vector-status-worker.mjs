/**
 * Ephemeral, QA-only Cloudflare diagnostic Worker for Issue106.
 * Reads two allowlisted D1 pending Map windows and TWO Vectorize indexes.
 * No write/query/upsert/insert, no model binding, no production bindings.
 * Never returns vector IDs, metadata, text, source fingerprints or credentials.
 */
const root="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const scope={
  A:{id:"1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v",job:"drive:"+root+"_qa_A"},
  B:{id:"1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn",job:"drive:"+root+"_qa_B"},
};
const digest=/^[a-f0-9]{64}$/;
const nodeId=/^map-[a-f0-9]{40}$/;
const metaOk=(item,id,doc,fp,epoch)=>{
  if(item?.id!==id||!item?.metadata)return false;
  const m=item.metadata;
  return m.sourceFileId===doc&&m.sourceFingerprint===fp&&
     m.stagedGeneration===epoch&&m.stagedLayer==="map"&&
     m.contentType==="document-map"&&m.status==="active"&&
     typeof m.text==="string"&&m.text.length>0&&
     typeof m.fileName==="string"&&m.fileName.length>0&&
     typeof m.sourcePath==="string"&&m.sourcePath.length>0&&
     Number.isSafeInteger(m.page)&&m.page>0&&
     Number.isSafeInteger(m.pageEnd)&&m.pageEnd>=m.page;
};
const presence=(records,id,doc,fp,epoch)=>{
  if(!Array.isArray(records)||records.length>1)
    return "invalid";
  if(records.length===0)return "missing";
  return metaOk(records[0],id,doc,fp,epoch)?"valid":"invalid";
};
const fail=code=>{throw Error(code)};
export async function inspectSlot(env,slot){
  if(!Object.hasOwn(scope,slot))fail("QA106_VECTOR_DIAG_UNKNOWN_SLOT");
  const {id,job}=scope[slot],db=env?.CORTEX_DB;
  if(!db?.prepare||!env?.VECTORIZE?.getByIds||
      !env?.VECTORIZE_V2?.getByIds)
    fail("QA106_VECTOR_DIAG_BINDINGS_MISSING");
  const epoch=await db.prepare(
    "SELECT staging_epoch,source_fingerprint FROM ingestion_v2_document_epochs "+
    "WHERE document_id=? AND job_key=?").bind(id,job).first();
  if(!Number.isSafeInteger(epoch?.staging_epoch)||epoch.staging_epoch<1||
     !digest.test(epoch.source_fingerprint))
    fail("QA106_VECTOR_DIAG_EPOCH_INVALID");
  const generation=epoch.staging_epoch,fp=epoch.source_fingerprint;
  const windows=await db.prepare(
    "SELECT ids_json FROM ingestion_v2_pending_map_windows "+
    "WHERE document_id=? AND job_key=? AND generation=? AND source_fingerprint=?"
  ).bind(id,job,generation,fp).all();
  if(!Array.isArray(windows?.results)||windows.results.length!==1)
    fail("QA106_VECTOR_DIAG_WINDOW_COUNT_INVALID");
  let pending;
  try{pending=JSON.parse(windows.results[0].ids_json)}
  catch{fail("QA106_VECTOR_DIAG_WINDOW_INVALID")}
  if(!Array.isArray(pending)||pending.length<1||pending.length>12||
     new Set(pending.map(p=>p?.logicalId)).size!==pending.length||
     new Set(pending.map(p=>p?.stagedId)).size!==pending.length||
     pending.some(p=>!nodeId.test(p?.logicalId||"")||
       !new RegExp("^v2m-"+generation.toString(36)+"-[a-f0-9]{40}$").test(p?.stagedId||"")))
    fail("QA106_VECTOR_DIAG_WINDOW_INVALID");
  const receipts=await db.prepare(
    "SELECT staged_id FROM ingestion_v2_vector_receipts "+
    "WHERE document_id=? AND generation=? AND layer='map' AND source_fingerprint=?"
  ).bind(id,generation,fp).all();
  if(!Array.isArray(receipts?.results)||receipts.results.length>pending.length)
    fail("QA106_VECTOR_DIAG_RECEIPTS_INVALID");
  const receiptIds=new Set(receipts.results.map(r=>r.staged_id));
  if([...receiptIds].some(r=>!pending.some(p=>p.stagedId===r)))
    fail("QA106_VECTOR_DIAG_RECEIPT_MISMATCH");
  const summary={slot,pending:pending.length,receipts:receiptIds.size,
    legacyMissing:0,v2Missing:0,legacyInvalid:0,v2Invalid:0,bothValid:0,
    bothMissing:0};
  for(const entry of pending){
    let reads;
    try{
      reads=await Promise.all([
        env.VECTORIZE.getByIds([entry.stagedId]),
        env.VECTORIZE_V2.getByIds([entry.stagedId]),
      ]);
    }catch{fail("QA106_VECTOR_DIAG_READBACK_UNAVAILABLE")}
    const a=presence(reads[0],entry.stagedId,id,fp,generation);
    const b=presence(reads[1],entry.stagedId,id,fp,generation);
    if(a==="missing")summary.legacyMissing++;
    if(b==="missing")summary.v2Missing++;
    if(a==="invalid")summary.legacyInvalid++;
    if(b==="invalid")summary.v2Invalid++;
    if(a==="valid"&&b==="valid")summary.bothValid++;
    if(a==="missing"&&b==="missing")summary.bothMissing++;
  }
  return summary;
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
export default {
  async fetch(req,env){
    if(req.method!=="POST"||new URL(req.url).pathname!=="/inspect")
      return json({error:"QA106_VECTOR_DIAG_NOT_FOUND"},404);
    if(typeof env?.DIAG_TOKEN!=="string"||env.DIAG_TOKEN.length<48||
       req.headers.get("authorization")!=="Bearer "+env.DIAG_TOKEN)
      return json({error:"QA106_VECTOR_DIAG_NOT_AUTHORIZED"},403);
    let input;
    try{input=await req.json()}catch{return json({error:"QA106_VECTOR_DIAG_BAD_PAYLOAD"},400)}
    if(!Object.hasOwn(scope,input?.slot)||Object.keys(input||{}).length!==1)
      return json({error:"QA106_VECTOR_DIAG_BAD_SCOPE"},400);
    try{return json({ok:true,...await inspectSlot(env,input.slot)})}
    catch(e){
      const m=String(e?.message||"");
      return json({ok:false,error:/^QA106_VECTOR_DIAG_[A-Z_]+$/.test(m)?
        m:"QA106_VECTOR_DIAG_READ_FAILED"},409);
    }
  }
};
