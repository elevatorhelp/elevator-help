/** Isolated QA only: ID presence alone cannot prove source revision after D1 restore. */
export function hasExactQaVectorReadback(records, expectedIds, documentId, fingerprint, expectedPages = null) {
  if (!Array.isArray(records) || !Array.isArray(expectedIds) ||
      expectedIds.length < 1 ||
      typeof documentId !== 'string' || !documentId ||
      typeof fingerprint !== 'string' || !fingerprint ||
      expectedIds.some(id => typeof id !== 'string' || !id) ||
      new Set(expectedIds).size !== expectedIds.length ||
      records.length !== expectedIds.length ||
      (expectedPages !== null &&
       (!(expectedPages instanceof Map) || expectedPages.size !== expectedIds.length))) return false;
  const expected = new Set(expectedIds);
  if (expectedPages !== null) {
    for (const [id, page] of expectedPages) {
      if (!expected.has(id) || !Number.isSafeInteger(page) || page < 1) return false;
    }
  }
  const seen = new Set();
  for (const record of records) {
    const page = expectedPages === null ? 1 : expectedPages.get(record?.id);
    const metadata = record?.metadata;
    // The real staged RAW route writes these fields to both physical indices.
    // A tombstone, empty source, or map node must not satisfy citation QA.
    if (!record || typeof record.id !== 'string' ||
        !expected.has(record.id) || seen.has(record.id) ||
        metadata?.sourceFileId !== documentId ||
        metadata?.sourceFingerprint !== fingerprint ||
        (metadata?.page !== page && metadata?.page !== String(page)) ||
        metadata?.status !== 'active' ||
        typeof metadata.text !== 'string' || !metadata.text.trim() ||
        typeof metadata.fileName !== 'string' || !metadata.fileName.trim() ||
        typeof metadata.sourcePath !== 'string' || !metadata.sourcePath.trim() ||
        !Number.isSafeInteger(metadata.chunkIndex) || metadata.chunkIndex < 0 ||
        metadata.contentType === 'document-map') return false;
    seen.add(record.id);
  }
  return seen.size === expected.size;
}
