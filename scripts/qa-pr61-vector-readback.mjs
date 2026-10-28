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
    if (!record || typeof record.id !== 'string' ||
        !expected.has(record.id) || seen.has(record.id) ||
        record.metadata?.sourceFileId !== documentId ||
        record.metadata?.sourceFingerprint !== fingerprint ||
        (record.metadata?.page !== page && record.metadata?.page !== String(page))) return false;
    seen.add(record.id);
  }
  return seen.size === expected.size;
}
