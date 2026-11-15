/**
 * Issue99 read-only Cloudflare QA Vectorize forensics.
 * Explicitly pinned to two test indexes and one synthetic document.
 * Never prints vector IDs, stored metadata, source text, embeddings or keys.
 * No writes or Gemini calls.
 */
const TARGET="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const INDEXES=["elevator-help-staging-test","elevator-help-staging-test-v2"];
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const MAX_MAP_IDS=300;
function check(c,m){if(!c)throw Error(m);}
check(process.env.GITHUB_ACTIONS==="true"&&
 process.env.GITHUB_EVENT_NAME==="push"&&
 process.env.GITHUB_REF==="refs/heads/qa/issue99-map-dual-index-readback-forensics-20261115"&&
 typeof TOKEN==="string"&&TOKEN.length>=20&&
 typeof ACCOUNT==="string"&&/^[a-f0-9]{32}$/i.test(ACCOUNT),
 "QA_FORENSICS_UNAPPROVED_CONTEXT");
async function request(index,method,suffix,body){
 check(INDEXES.includes(index),"QA_FORENSICS_UNKNOWN_INDEX");
 const url="https://api.cloudflare.com/client/v4/accounts/"+
  ACCOUNT+"/vectorize/v2/indexes/"+index+suffix;
 const opts={method,headers:{Authorization:"Bearer "+TOKEN},signal:AbortSignal.timeout(25000)};
 if(body!==undefined){
   opts.headers["Content-Type"]="application/json";
   opts.body=JSON.stringify(body);
 }
 let r,payload;
 try{r=await fetch(url,opts);payload=await r.json();}
 catch{throw Error("QA_FORENSICS_CF_REQUEST_FAILED");}
 check(r.ok&&payload?.success===true&&payload.result!==undefined,
   "QA_FORENSICS_CF_API_NOT_AVAILABLE");
 return payload.result;
}
async function listMaps(index){
 let cursor="",found=[];
 for(let page=0;page<5;page++){
   const query=new URLSearchParams({count:"1000"});
   if(cursor)query.set("cursor",cursor);
   const result=await request(index,"GET","/list?"+query.toString());
   check(Array.isArray(result.vectors),"QA_FORENSICS_LIST_INVALID");
   for(const row of result.vectors){
     if(typeof row.id==="string"&&/^v2m-[a-z0-9]+-[0-9a-f]{40}$/.test(row.id))
       found.push(row.id);
   }
   check(found.length<=MAX_MAP_IDS,"QA_FORENSICS_TOO_MANY_QA_MAP_IDS");
   if(!result.isTruncated)return found;
   check(typeof result.nextCursor==="string"&&result.nextCursor.length>0,
    "QA_FORENSICS_LIST_CURSOR_INVALID");
   cursor=result.nextCursor;
 }
 throw Error("QA_FORENSICS_LIST_PAGINATION_LIMIT");
}
function fieldReport(m){
 const checks={
   source:m?.sourceFileId===TARGET,
   fingerprint:typeof m?.sourceFingerprint==="string"&&m.sourceFingerprint.length>0,
   generation:Number.isSafeInteger(m?.stagedGeneration)&&m.stagedGeneration>=1,
   layer:m?.stagedLayer==="map",
   status:m?.status==="active",
   text:typeof m?.text==="string"&&m.text.trim().length>0&&m.text.length<=60000,
   fileName:typeof m?.fileName==="string"&&m.fileName.trim().length>0&&m.fileName.length<=512,
   sourcePath:typeof m?.sourcePath==="string"&&m.sourcePath.trim().length>0&&m.sourcePath.length<=1024,
   page:Number.isSafeInteger(m?.page)&&m.page>=1,
   pageEnd:Number.isSafeInteger(m?.pageEnd)&&m.pageEnd>=m.page,
   contentType:m?.contentType==="document-map"
 };
 return {checks,complete:Object.values(checks).every(Boolean)};
}
async function inspect(index,ids){
 const documents=new Map();
 let requestBatches=0;
 for(let i=0;i<ids.length;i+=20){
   const requested=ids.slice(i,i+20);
   const records=await request(index,"POST","/get_by_ids",{ids:requested});
   check(Array.isArray(records),"QA_FORENSICS_GETBYIDS_INVALID");
   requestBatches++;
   for(const record of records){
     if(typeof record?.id!=="string"||record?.metadata?.sourceFileId!==TARGET)continue;
     const report=fieldReport(record.metadata);
     documents.set(record.id,report);
   }
 }
 const flags={};
 for(const v of documents.values()) for(const [key,good] of Object.entries(v.checks))
   if(!good)flags[key]=(flags[key]||0)+1;
 return {index,listed:ids.length,readBack:documents.size,valid:[...documents.values()].filter(v=>v.complete).length,flags,ids:[...documents.keys()]};
}
async function main(){
 const rows=[];
 for(const name of INDEXES){
   const ids=await listMaps(name);
   rows.push(await inspect(name,ids));
 }
 const both=new Set(rows[1].ids);
 const shared=rows[0].ids.filter(id=>both.has(id)).length;
 for(const r of rows){
   console.log("QA_ONLY_INDEX="+(r.index===INDEXES[0]?"legacy":"multilingual")+
      " map_ids_listed="+r.listed+
      " synthetic_doc_map_getByIds="+r.readBack+
      " metadata_valid="+r.valid+
      " field_fail_counts="+JSON.stringify(r.flags));
 }
 console.log("QA_ONLY_MAP_DUAL_READBACK_COMMON_IDS="+shared);
 console.log("QA_ONLY_NO_GEMINI_NO_DATABASE_WRITES");
}
main().catch(e=>{
 const code=String(e?.message||"");
 console.error("::error::"+(/^QA_FORENSICS_[A-Z_]+$/.test(code)?code:"QA_FORENSICS_ABORTED"));
 process.exitCode=1;
});
