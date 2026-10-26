/** Verify that every read-back vector belongs to the exact staged source revision.
 * Vector IDs can be reused after a D1 Time Travel restore; ID-only checks can
 * therefore mistake stale Vectorize contents for a newly staged generation.
 * This guard is pure and performs no network calls or mutations.
 */
export function hasExactStagedVectorReadback(
  found: unknown,
  expectedIds: readonly string[],
  documentId: string,
  sourceFingerprint: string,
): boolean {
  if (!Array.isArray(found) || !Array.isArray(expectedIds) ||
      expectedIds.length < 1 || expectedIds.length > 20 ||
      expectedIds.some(id => typeof id !== "string" || !id) ||
      typeof documentId !== "string" || !documentId ||
      typeof sourceFingerprint !== "string" || !sourceFingerprint)
    return false;
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length) return false;
  const seen = new Set<string>();
  for (const vector of found) {
    if (!vector || typeof vector.id !== "string" ||
        !expected.has(vector.id) || seen.has(vector.id) ||
        !vector.metadata || typeof vector.metadata !== "object" ||
        vector.metadata.sourceFileId !== documentId ||
        vector.metadata.sourceFingerprint !== sourceFingerprint)
      return false;
    seen.add(vector.id);
  }
  return seen.size === expected.size;
}
