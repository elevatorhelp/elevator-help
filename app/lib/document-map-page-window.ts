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
