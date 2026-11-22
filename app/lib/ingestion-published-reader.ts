/**
 * Feature-gated read-side publication visibility for legacy + immutable archive.
 * All user-facing Vectorize query/getByIds results are checked against the
 * SAME authoritative D1 publication record before downstream answer synthesis.
 * Disabled means legacy Production behavior is entirely unchanged.
 */
import {filterVisibleImmutableVectors} from "./ingestion-immutable-publication.ts";
import type {CoordinatorDB} from "./ingestion-global-coordinator.ts";
import {
 filterGenericPublishedMapPreview,filterGenericPublishedRawPreview,
} from "./ingestion-map-revision-visibility.ts";

type VectorIndex={
  query:(...args:any[])=>Promise<{matches?:Array<{id:string;metadata?:Record<string,unknown>}>;[key:string]:unknown}>;
  getByIds?:(ids:string[])=>Promise<Array<{id:string;metadata?:Record<string,unknown>}>>;
};
export function publishedArchiveEnv<T extends Record<string,any>>(env:T):T {
  const publishedEnabled=String(env?.INGESTION_PUBLISHED_READS_ENABLED).toLowerCase()==="true";
  const revisionRequested=String(env?.INGESTION_MAP_REVISION_READS_ENABLED).toLowerCase()==="true";
  if(!publishedEnabled&&!revisionRequested)return env;
  // A revision-only configuration without the existing published-read fence
  // is a configuration ERROR: deny all archive results rather than leaking
  // unpublished/legacy data.
  const db:CoordinatorDB|undefined=
    publishedEnabled&&env?.CORTEX_DB?.prepare?env.CORTEX_DB:undefined;
  const pair:[VectorIndex,VectorIndex]|undefined=
    env?.VECTORIZE?.getByIds&&env?.VECTORIZE_V2?.getByIds?
      [env.VECTORIZE,env.VECTORIZE_V2]:undefined;
  const revisionMode=publishedEnabled&&revisionRequested;
  const strictRevision=async(matches:Array<{id:string;metadata?:Record<string,unknown>}> )=>{
    if(!db||!pair||!Array.isArray(matches))return [];
    try{
      // Both Map and RAW are tied to the SAME single D1 active revision.
      // The original candidate objects (not just their IDs) are approved;
      // forged metadata or uncommitted old Map hits cannot substitute for
      // an approved hit. Preserve original relevance sorting.
      const [map,raw]=await Promise.all([
        filterGenericPublishedMapPreview(db,matches,pair as any),
        filterGenericPublishedRawPreview(db,matches,pair as any),
      ]);
      const allowed=new Set([...map,...raw]);
      const seen=new Set<string>();
      return matches.filter(x=>{
        if(!allowed.has(x)||seen.has(x.id))return false;
        seen.add(x.id);return true;
      });
    }catch{return []}
  };
  const guardVector=(index:VectorIndex|undefined)=>{
    if(!index)return undefined;
    return {
      async query(...args:any[]) {
        if(!db||revisionRequested&&!publishedEnabled)return {matches:[]};
        try{
          const result=await index.query(...args);
          return {...result,matches:revisionMode?
            await strictRevision(result?.matches||[]):
            await filterVisibleImmutableVectors(db,result?.matches||[],true)};
        }catch{return {matches:[]}}
      },
      async getByIds(ids:string[]) {
        if(!db||revisionRequested&&!publishedEnabled)return [];
        try{
          const result=await index.getByIds?.(ids);
          return revisionMode?
            strictRevision(result||[]):
            filterVisibleImmutableVectors(db,result||[],true);
        }catch{return []}
      },
    };
  };
  // The legacy Evidence search uses this marker to filter archive_chunks
  // superseded by a D1-published immutable source generation.
  const guardedDb=db?new Proxy(db as CoordinatorDB&Record<string,any>,{
    get(target,property){
      if(property==="__immutableReadGate")return true;
      if(property==="__mapRevisionReadGate")return revisionMode;
      const member=Reflect.get(target,property,target);
      // D1 native methods require their original binding: do not break
      // quota/rate-limit/status paths that also use this environment.
      return typeof member==="function"?member.bind(target):member;
    },
  }):undefined;
  return Object.assign(Object.create(env),{
    VECTORIZE:guardVector(env.VECTORIZE),
    VECTORIZE_V2:guardVector(env.VECTORIZE_V2),
    CORTEX_DB:guardedDb,
  }) as T;
}
