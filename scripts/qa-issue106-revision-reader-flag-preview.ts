/**
 * Issue #106: OFFLINE ONLY test adapter for feature-flagged revision reads.
 *
 * No application file imports this, and it is NOT an API route. A false or
 * absent flag preserves original environment identity/behavior. When the
 * preview flag is true, every Vectorize query/getByIds path and exact
 * evidence read is routed through the generic D1-revision visibility proof.
 * Missing DB, indexes, corrupt/missing migration or errors => EMPTY results,
 * never unfiltered legacy fallback.
 */
import type {CoordinatorDB} from "../app/lib/ingestion-global-coordinator.ts";
import type {ImmutableIndex,VectorMatch}
 from "../app/lib/ingestion-immutable-publication.ts";
import {
 filterGenericPublishedMapPreview,filterGenericPublishedRawPreview,
 readGenericPublishedEvidencePreview,
} from "./qa-issue106-generic-map-publication-preview.ts";

type Q=VectorMatch;
type Index=ImmutableIndex&{
 query:(...args:unknown[])=>Promise<{matches?:Q[];[key:string]:unknown}>;
};
export type PreviewEnv={
 INGESTION_MAP_REVISION_READS_PREVIEW_ENABLED?:string;
 CORTEX_DB?:CoordinatorDB;
 VECTORIZE?:Index;
 VECTORIZE_V2?:Index;
 [key:string]:unknown;
};
async function approved(
 db:CoordinatorDB,matches:Q[],indexes:readonly [Index,Index],
):Promise<Q[]>{
 const [map,raw]=await Promise.all([
  filterGenericPublishedMapPreview(db,matches,indexes),
  filterGenericPublishedRawPreview(db,matches,indexes),
 ]);
 const accepted=new Set<Q>([...map,...raw]);
 const seen=new Set<string>();
 return matches.filter(x=>{
  if(!accepted.has(x)||seen.has(x.id))return false;
  seen.add(x.id);return true;
 });
}
export function revisionReadGatePreview<T extends PreviewEnv>(env:T):T{
 if(env?.INGESTION_MAP_REVISION_READS_PREVIEW_ENABLED!=="true")return env;
 const db=env?.CORTEX_DB;
 const originals=[env?.VECTORIZE,env?.VECTORIZE_V2];
 const available=!!db?.prepare&&originals.length===2&&originals.every(i=>
  i&&typeof i.getByIds==="function"&&typeof i.query==="function");
 const indexes=originals as [Index,Index];
 const filter=async(matches:Q[])=>{
  if(!available||!Array.isArray(matches))return [];
  try{return await approved(db!,matches,indexes)}
  catch{return []}
 };
 const wrap=(original:Index|undefined):Index=>({
  async query(...args:unknown[]){
   if(!available||!original)return {matches:[]};
   try{
    const result=await original.query(...args);
    return {...result,matches:await filter(result?.matches||[])};
   }catch{return {matches:[]}}
  },
  async getByIds(ids:string[]){
   if(!available||!original||!Array.isArray(ids))return [];
   try{
    const result=await original.getByIds(ids);
    return filter(Array.isArray(result)?result:[]);
   }catch{return []}
  },
  async insert(){throw Error("QA106_REVISION_READ_PREVIEW_WRITE_DENIED")},
 });
 return Object.assign(Object.create(env),{
  VECTORIZE:wrap(env.VECTORIZE),VECTORIZE_V2:wrap(env.VECTORIZE_V2),
  async readExactEvidence(documentId:string,limit=100){
   if(!available)return [];
   return readGenericPublishedEvidencePreview(db,documentId,indexes,limit);
  },
  __mapRevisionReadGatePreview:true,
 }) as T;
}
