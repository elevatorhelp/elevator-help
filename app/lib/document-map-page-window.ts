/** Validate the physical-page order assumed by document-map prompt bounds. */
export type DocumentMapPageInput = { page: number; text: string };

export function isOrderedDocumentMapPageWindow(value: unknown): value is DocumentMapPageInput[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  let previousPage = 0;
  for (const page of value) {
    if (!page || typeof page !== "object" ||
        !Number.isSafeInteger(page.page) || page.page <= previousPage ||
        typeof page.text !== "string") return false;
    previousPage = page.page;
  }
  return true;
}

/** Never attribute generated map content to a page absent from the supplied source window. */
export function validatedDocumentMapNodePageRange(
  start: unknown,
  end: unknown,
  pages: readonly DocumentMapPageInput[],
): { pageStart: number; pageEnd: number } | null {
  if (!isOrderedDocumentMapPageWindow(pages) ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      (start as number) <= 0 || (end as number) < (start as number)) return null;

  const first = pages.findIndex((page) => page.page === start);
  const last = pages.findIndex((page) => page.page === end);
  if (first < 0 || last < first || (end as number) - (start as number) !== last - first)
    return null;
  return { pageStart: start as number, pageEnd: end as number };
}

/** Validate the staged document revision before any paid Gemini/embedding calls.
 * The receipt writer rejects blank or oversized fingerprints after upsert;
 * rejecting them here prevents unreceipted vectors and wasted API calls.
 */
export function hasValidStagedDocumentMapIdentity(
  document: unknown,
  lease: { jobKey: string; generation: number } | null,
): boolean {
  if (!document || typeof document !== "object" || Array.isArray(document) ||
      !lease || typeof lease.jobKey !== "string" ||
      !Number.isSafeInteger(lease.generation) || lease.generation < 1)
    return false;
  const value = document as Record<string, unknown>;
  return typeof value.sourceFileId === "string" &&
    value.sourceFileId === lease.jobKey &&
    typeof value.sourceFingerprint === "string" &&
    !!value.sourceFingerprint.trim() && value.sourceFingerprint.length <= 512;
}
