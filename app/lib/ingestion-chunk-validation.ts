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
