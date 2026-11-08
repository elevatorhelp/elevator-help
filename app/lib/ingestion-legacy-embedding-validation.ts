/** BGE-base-en-v1.5 produces 768-dimensional vectors. Validate the full
 * Workers AI response before writing to either physical Vectorize index:
 * an equal outer count alone does not rule out missing or corrupt vectors.
 */
export const LEGACY_BGE_BASE_EN_DIMENSIONS = 768;

export function hasValidLegacyEmbeddingBatch(
  embeddings: unknown,
  expectedCount: number,
): embeddings is number[][] {
  return Number.isSafeInteger(expectedCount) && expectedCount > 0 &&
    Array.isArray(embeddings) && embeddings.length === expectedCount &&
    embeddings.every((vector) =>
      Array.isArray(vector) &&
      vector.length === LEGACY_BGE_BASE_EN_DIMENSIONS &&
      vector.every((value) => typeof value === "number" && Number.isFinite(value)) &&
      vector.some((value) => value !== 0),
    );
}
