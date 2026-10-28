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
