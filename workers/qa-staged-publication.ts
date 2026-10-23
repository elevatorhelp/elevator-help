import {parseIngestionLease,guardedIngestionSideEffect,assertActiveIngestionLease} from "../app/lib/ingestion-lease-guard.ts";
import {recordStagedBatch,publishExactStagedManifest,stagedVectorId} from "../app/lib/ingestion-generation-publication.ts";
import {filterPublishedMatches} from "../app/lib/ingestion-publication-visibility.ts";
type Env={CORTEX_DB:any;VECTORIZE:any;VECTORIZE_V2:any;QA_RUN_TOKEN:string};
const respond=(value:unknown,status=200)=>Response.json(value,{status});
const vec=(i:number)=>Array.from({length:768},(_,k)=>k===i%768?0.9:0.001);
export default {async fetch(request:Request,env:Env):Promise<Response>{
 if(request.method!=="POST"||request.headers.get("X-QA-Token")!==env.QA_RUN_TOKEN)return respond({error:"unauthorized"},403);
 const {pathname}=new URL(request.url);
 let body:any;try{body=await request.json()}catch{return respond({error:"invalid_json"},400)}
 const doc=String(body.documentId||"");
 if(!/^qa61-[a-z0-9-]{5,100}$/.test(doc))return respond({error:"isolated_documents_only"},400);
 const db=env.CORTEX_DB;
 try{
  if(pathname==="/lease"){
   const owner=String(body.owner||"");
   if(!/^qa-[a-z0-9-]{4,80}$/.test(owner))return respond({error:"bad_owner"},400);
   const now=Date.now();
   await db.prepare("INSERT OR IGNORE INTO ingestion_document_publications (document_id,job_key,active_generation,updated_at_ms) VALUES(?,?,0,?)").bind(doc,doc,now).run();
   await db.prepare(`INSERT INTO ingestion_worker_leases(job_key,owner,generation,lease_until_ms)
      VALUES(?,?,1,?) ON CONFLICT(job_key) DO UPDATE SET
      owner=excluded.owner,generation=ingestion_worker_leases.generation+1,
      lease_until_ms=excluded.lease_until_ms
      WHERE ingestion_worker_leases.lease_until_ms<=?`)
      .bind(doc,owner,now+180000,now).run();
   const lease=await db.prepare("SELECT job_key AS jobKey,owner,generation,lease_until_ms FROM ingestion_worker_leases WHERE job_key=?").bind(doc).first();
   if(lease?.owner!==owner)return respond({error:"lease_owned"},409);
   return respond({lease:{jobKey:doc,owner,generation:lease.generation}});
  }
  const lease=parseIngestionLease(body.lease);
  if(!lease||lease.jobKey!==doc)return respond({error:"invalid_lease"},400);
  if(pathname==="/batch"){
   const chunks=body.chunks;
   if(!Array.isArray(chunks)||chunks.length<1||chunks.length>8||chunks.some((c:any)=>
     typeof c.id!=="string"||!c.id.startsWith(doc+":")||typeof c.sourceFingerprint!=="string"||
     c.sourceFingerprint!==chunks[0].sourceFingerprint))
     return respond({error:"invalid_batch"},400);
   const records=chunks.map((c:any,i:number)=>({
      id:stagedVectorId(c.id,lease.generation),values:vec(Number(c.ordinal??i)),
      metadata:{sourceFileId:doc,sourceFingerprint:c.sourceFingerprint,text:"QA isolated test"}
   }));
   await guardedIngestionSideEffect(db,lease,()=>env.VECTORIZE.upsert(records));
   await guardedIngestionSideEffect(db,lease,()=>env.VECTORIZE_V2.upsert(records));
   await recordStagedBatch(db,lease,doc,chunks.map((c:any)=>c.id),chunks[0].sourceFingerprint);
   return respond({ok:true,staged:true,ids:records.map((v:any)=>v.id)});
  }
  if(pathname==="/publish"){
   const published=await publishExactStagedManifest(db,lease,doc,
      body.sourceFingerprint,body.manifestIds);
   return respond({published},published?200:409);
  }
  if(pathname==="/read"){
   const ids=body.ids;
   if(!Array.isArray(ids)||ids.length<1||ids.length>30)return respond({error:"bad_ids"},400);
   const vectors=await env.VECTORIZE.getByIds(ids);
   const visible=await filterPublishedMatches(db,vectors||[]);
   return respond({visibleIds:visible.map((v:any)=>v.id),found:(vectors||[]).length});
  }
  if(pathname==="/expire"){
   // QA scoped force-expiry; intentionally cannot affect other jobs.
   await assertActiveIngestionLease(db,lease);
   await db.prepare("UPDATE ingestion_worker_leases SET lease_until_ms=0 WHERE job_key=? AND owner=? AND generation=?")
     .bind(doc,lease.owner,lease.generation).run();
   return respond({expired:true});
  }
  return respond({error:"unknown_route"},404);
 }catch(e:any){
  return respond({error:String(e?.message||"QA_WORKER_FAILED").slice(0,180)},409);
 }
}};
