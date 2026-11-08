// This read-only QA helper selects a queryable chunk from the ACTIVE published
// generation, not merely the first chunk (which may have no identifier).
export function activeEvidenceQuery(fileId) {
  if (typeof fileId !== "string" || !/^[A-Za-z0-9_-]{10,128}$/.test(fileId)) {
    throw Error("QA_INVALID_TARGET_FILE_ID");
  }
  return "SELECT e.document_id,e.generation,e.chunk_id,e.identifiers_json,e.page " +
    "FROM ingestion_staged_evidence e JOIN ingestion_document_publications p " +
    "ON p.document_id=e.document_id AND p.active_generation=e.generation " +
    "WHERE e.document_id='" + fileId + "' ORDER BY e.page,e.chunk_id LIMIT 1024";
}

export function selectQueryableEvidence(rows, extractReferenceIdentifiers) {
  for (const record of rows) {
    // A matching identifier on PDF page 0, a negative page, or an imprecise
    // numeric value is not a source-page citation. Fail the QA run closed.
    if (!Number.isSafeInteger(record?.page) || record.page < 1) {
      throw Error("QA_INVALID_EVIDENCE_PAGE");
    }
    const identifiers = JSON.parse(record.identifiers_json);
    if (!Array.isArray(identifiers)) throw Error("QA_INVALID_EVIDENCE_IDENTIFIERS");
    const candidate = identifiers.find(identifier =>
      identifier && typeof identifier.label === "string" &&
      typeof identifier.key === "string" &&
      extractReferenceIdentifiers(identifier.label).some(parsed => parsed.key === identifier.key));
    if (candidate) return { record, candidate };
  }
  return null;
}
