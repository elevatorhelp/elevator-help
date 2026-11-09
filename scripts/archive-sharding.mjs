import { createHash } from "node:crypto";

export const SHARD_COUNT = 2;
export const SHARD_FORMAT_VERSION = 1;

export function shardForDocumentId(id, count = SHARD_COUNT) {
  if (typeof id !== "string" || !id.trim() ||
      !Number.isSafeInteger(count) || count < 1 || count > 16) {
    throw new Error("INVALID_ARCHIVE_SHARD_ASSIGNMENT");
  }
  const hash = createHash("sha256").update(id, "utf8").digest();
  return hash.readUInt32BE(0) % count;
}

export function validateShardParameters(index, count) {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(count) ||
      count !== SHARD_COUNT || index < 0 || index >= count) {
    throw new Error("INVALID_ARCHIVE_SHARD_PARAMETERS");
  }
}

export function assertShardState(state, index, count) {
  validateShardParameters(index, count);
  const marker = state?.parallelShard;
  if (marker?.version !== SHARD_FORMAT_VERSION ||
      marker.index !== index || marker.count !== count) {
    throw new Error("PARALLEL_SHARD_MARKER_MISMATCH");
  }
  if (!state.scopes || typeof state.scopes !== "object" ||
      Array.isArray(state.scopes)) throw new Error("INGESTION_STATE_CORRUPT");
  for (const scope of Object.values(state.scopes)) {
    if (!scope || typeof scope !== "object" ||
        !scope.files || typeof scope.files !== "object" ||
        Array.isArray(scope.files)) throw new Error("INGESTION_SCOPE_CORRUPT");
    for (const id of Object.keys(scope.files)) {
      if (shardForDocumentId(id, count) !== index) throw new Error("CROSS_SHARD_STATE_RECORD");
    }
    for (const id of Object.keys(scope.fileFailures || {})) {
      if (shardForDocumentId(id, count) !== index) throw new Error("CROSS_SHARD_FAILURE_RECORD");
    }
  }
  return true;
}

// One-time, offline migration of the LAST VERIFIED serial checkpoint.
// No Drive, Gemini, D1, Vectorize or remote calls.
export function splitIngestionState(legacy, index, count) {
  validateShardParameters(index, count);
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy) ||
      !legacy.scopes || typeof legacy.scopes !== "object" ||
      Array.isArray(legacy.scopes) || legacy.parallelShard) {
    throw new Error("INVALID_LEGACY_STATE_FOR_BOOTSTRAP");
  }
  const output = structuredClone(legacy);
  output.parallelShard = { version: SHARD_FORMAT_VERSION, index, count };
  for (const scope of Object.values(output.scopes)) {
    if (!scope || typeof scope !== "object" || Array.isArray(scope) ||
        !scope.files || typeof scope.files !== "object" ||
        Array.isArray(scope.files)) throw new Error("INGESTION_SCOPE_CORRUPT");
    scope.files = Object.fromEntries(Object.entries(scope.files).filter(
      ([id]) => shardForDocumentId(id, count) === index
    ));
    if (scope.fileFailures) {
      scope.fileFailures = Object.fromEntries(Object.entries(scope.fileFailures).filter(
        ([id]) => shardForDocumentId(id, count) === index
      ));
    }
  }
  assertShardState(output, index, count);
  return output;
}
