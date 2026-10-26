/** Isolated QA only: ID presence alone cannot prove source revision after D1 restore. */
export function hasExactQaVectorReadback(records, expectedIds, documentId, fingerprint) {
  if (!Array.isArray(records) || !Array.isArray(expectedIds) ||
      expectedIds.length < 1 ||
      typeof documentId !== 'string' || !documentId ||
      typeof fingerprint !== 'string' || !fingerprint ||
      expectedIds.some(id => typeof id !== 'string' || !id) ||
      new Set(expectedIds).size !== expectedIds.length ||
      records.length !== expectedIds.length) return false;
  const expected = new Set(expectedIds);
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' ||
        !expected.has(record.id) || seen.has(record.id) ||
        record.metadata?.sourceFileId !== documentId ||
        record.metadata?.sourceFingerprint !== fingerprint ||
        (record.metadata?.page !== 1 && record.metadata?.page !== '1')) return false;
    seen.add(record.id);
  }
  return seen.size === expected.size;
}
