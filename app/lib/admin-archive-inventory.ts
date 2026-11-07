/**
 * Read-only D1 evidence inventory. This is NOT Drive's total file count.
 * It counts source_file_ids that have published exact-evidence chunks in D1.
 */
export type ArchiveEvidenceInventory = {
  indexedEvidenceFiles: number;
  evidenceChunks: number;
  source: "D1.archive_chunks";
  note: string;
};
type QueryRow = { indexed_files?: unknown; evidence_chunks?: unknown };
type ReadDB = { prepare: (query: string) => { first: () => Promise<QueryRow | null> } };

export async function readPublishedEvidenceInventory(db: ReadDB | null | undefined): Promise<ArchiveEvidenceInventory | null> {
  if (!db) return null;
  try {
    const row = await db.prepare("SELECT COUNT(DISTINCT source_file_id) AS indexed_files, COUNT(*) AS evidence_chunks FROM archive_chunks").first();
    const count = row?.indexed_files;
    const chunks = row?.evidence_chunks;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 ||
        typeof chunks !== "number" || !Number.isSafeInteger(chunks) || chunks < count) return null;
    return {
      indexedEvidenceFiles: count,
      evidenceChunks: chunks,
      source: "D1.archive_chunks",
      note: "Published exact-evidence D1 inventory only. It does NOT prove raw-vector or document-map completion or full Google Drive discovery.",
    };
  } catch {
    return null;
  }
}
