// Durable, source-redacted ledger for per-document ingestion exceptions.
// A failed document remains pending and retriable: this is NOT a completion flag.
export function classifyIngestionFailure(error) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "InvalidPDFException") return "INVALID_PDF";
  if (name === "PasswordException") return "ENCRYPTED_PDF";
  if (message.startsWith("INGESTION_GEMINI_BUDGET_EXCEEDED")) return "GEMINI_BUDGET";
  if (message.startsWith("INGESTION_ENDPOINT_TRANSPORT_FAILURE")) return "TRANSPORT";
  return "DOCUMENT_PROCESSING_ERROR";
}

export function recordIngestionFailure(scope, { fileId, fingerprint, phase, error, at }) {
  if (!scope || typeof scope !== "object" ||
      typeof fileId !== "string" || !fileId ||
      typeof fingerprint !== "string" || !fingerprint ||
      !["evidence", "raw", "map"].includes(phase) ||
      typeof at !== "string" || !Number.isFinite(Date.parse(at))) {
    throw new Error("INVALID_INGESTION_FAILURE_RECORD");
  }
  scope.fileFailures ||= {};
  const prior = scope.fileFailures[fileId];
  const category = classifyIngestionFailure(error);
  const sameFailure = prior?.fingerprint === fingerprint &&
    prior?.phase === phase && prior?.category === category;
  const record = {
    fingerprint,
    phase,
    category,
    attempts: sameFailure ? Math.min(9999, (prior.attempts || 0) + 1) : 1,
    firstSeenAt: sameFailure ? prior.firstSeenAt : at,
    lastSeenAt: at,
    status: "needs_review",
  };
  // No document title, path, raw exception message, URLs or token values.
  scope.fileFailures[fileId] = record;
  return record;
}

export function clearIngestionFailure(scope, fileId) {
  if (scope?.fileFailures &&
      Object.prototype.hasOwnProperty.call(scope.fileFailures, fileId)) {
    delete scope.fileFailures[fileId];
  }
}
