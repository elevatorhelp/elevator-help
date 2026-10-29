/** Reject invalid archive citation anchors before any embedding, D1 or Vectorize write.
 * This is shared by all chunk ingestion actions, including legacy upsert.
 */
export function hasValidIngestionChunk(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) return false;
  const value = chunk as Record<string, unknown>;
  return typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.text === "string" &&
    typeof value.sourceFileId === "string" && value.sourceFileId.trim().length > 0 &&
    typeof value.fileName === "string" &&
    typeof value.sourcePath === "string" &&
    Number.isSafeInteger(value.page) && Number(value.page) >= 1 &&
    Number.isSafeInteger(value.chunkIndex) && Number(value.chunkIndex) >= 0;
}

/** Staged RAW batches must be publishable before any paid embedding call.
 * This checks the exact receipt/vector ID bounds and document lease identity;
 * the route separately checks that all chunks share one source fingerprint.
 */
export function hasValidStagedChunkBatch(
  chunks: readonly {id:string;sourceFileId:string;sourceFingerprint?:string}[],
  lease: {jobKey:string;generation:number}|null,
): boolean {
  if (!lease || !Number.isSafeInteger(lease.generation) || lease.generation < 1 ||
      !Array.isArray(chunks) || chunks.length < 1 || chunks.length > 8) return false;
  return chunks.every(chunk =>
    !!chunk && typeof chunk.id === "string" && !!chunk.id.trim() &&
    chunk.id.length <= 512 &&
    `g${lease.generation}:${chunk.id}`.length <= 512 &&
    chunk.sourceFileId === lease.jobKey &&
    typeof chunk.sourceFingerprint === "string" &&
    !!chunk.sourceFingerprint.trim() && chunk.sourceFingerprint.length <= 512);
}
