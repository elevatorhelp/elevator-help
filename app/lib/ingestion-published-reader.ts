/**
 * Feature-gated read-side publication visibility for legacy + immutable archive.
 * All user-facing Vectorize query/getByIds results are checked against the
 * SAME authoritative D1 publication record before downstream answer synthesis.
 * Disabled means legacy Production behavior is entirely unchanged.
 */
import {filterVisibleImmutableVectors} from "./ingestion-immutable-publication.ts";
import type {CoordinatorDB} from "./ingestion-global-coordinator.ts";

type VectorIndex={
  query:(...args:any[])=>Promise<{matches?:Array<{id:string;metadata?:Record<string,unknown>}>;[key:string]:unknown}>;
  getByIds?:(ids:string[])=>Promise<Array<{id:string;metadata?:Record<string,unknown>}>>;
};
export function publishedArchiveEnv<T extends Record<string,any>>(env:T):T {
  if(String(env?.INGESTION_PUBLISHED_READS_ENABLED).toLowerCase()!=="true")
    return env;
  const db:CoordinatorDB|undefined=env?.CORTEX_DB?.prepare?env.CORTEX_DB:undefined;
  const guardVector=(index:VectorIndex|undefined)=>{
    if(!index)return undefined;
    return {
      async query(...args:any[]) {
        if(!db)return {matches:[]};
        const result=await index.query(...args);
        return {...result,matches:await filterVisibleImmutableVectors(db,result?.matches||[],true)};
      },
      async getByIds(ids:string[]) {
        if(!db)return [];
        const result=await index.getByIds?.(ids);
        return filterVisibleImmutableVectors(db,result||[],true);
      },
    };
  };
  // The legacy Evidence search uses this marker to filter archive_chunks
  // superseded by a D1-published immutable source generation.
  const guardedDb=db?new Proxy(db as CoordinatorDB&Record<string,any>,{
    get(target,property){
      if(property==="__immutableReadGate")return true;
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
