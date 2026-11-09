// Crash-safe two-shard checkpoint compatibility for the existing serial schedule.
// No Drive/D1/Gemini operations in this module.
import {splitIngestionState,assertShardState} from "./archive-sharding.mjs";

export function splitLatestSerialState(legacy) {
  if (!legacy || typeof legacy!=="object" || Array.isArray(legacy) ||
      !legacy.scopes || legacy.parallelShard) {
    throw Error("DUAL_CANARY_REQUIRES_VERIFIED_SERIAL_CHECKPOINT");
  }
  const shards=[0,1].map(index=>splitIngestionState(legacy,index,2));
  for(const [s,shard] of shards.entries()) {
    for(const [scopeId,scope] of Object.entries(shard.scopes)) {
      const original=legacy.scopes[scopeId];
      const historic=original?.parallelCursors?.[s];
      if(historic)scope.phaseCursors=structuredClone(historic);
      const priorPhase=original?.parallelLastSelectedPhase?.[s];
      if(typeof priorPhase==="string")scope.lastSelectedPhase=priorPhase;
    }
    assertShardState(shard,s,2);
  }
  return shards;
}

export function mergeCanaryCheckpoints(legacy,first,second) {
  assertShardState(first,0,2);
  assertShardState(second,1,2);
  if(!legacy||typeof legacy!=="object"||Array.isArray(legacy)||
     !legacy.scopes||legacy.parallelShard)throw Error("INVALID_MERGE_BASE_STATE");
  const merged=structuredClone(legacy);
  const ids=new Set([...Object.keys(legacy.scopes),...Object.keys(first.scopes),...Object.keys(second.scopes)]);
  for(const scopeId of ids) {
    const a=first.scopes[scopeId]||{files:{}};
    const b=second.scopes[scopeId]||{files:{}};
    const f0=Object.keys(a.files||{}),f1=Object.keys(b.files||{});
    if(f0.some(id=>Object.prototype.hasOwnProperty.call(b.files||{},id)))
      throw Error("DUAL_SHARD_OVERLAP");
    const old=merged.scopes[scopeId]||{files:{}};
    const clean={...old,files:{...a.files,...b.files}};
    const failuresA=a.fileFailures||{},failuresB=b.fileFailures||{};
    if(Object.keys(failuresA).some(id=>Object.hasOwn(failuresB,id)))
      throw Error("DUAL_FAILURE_RECORD_OVERLAP");
    clean.fileFailures={...failuresA,...failuresB};
    clean.parallelCursors={"0":a.phaseCursors||{},"1":b.phaseCursors||{}};
    clean.parallelLastSelectedPhase={"0":a.lastSelectedPhase||null,"1":b.lastSelectedPhase||null};
    merged.scopes[scopeId]=clean;
  }
  delete merged.parallelShard;
  merged.version=3;
  return merged;
}
