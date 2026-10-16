// Reference discovery is deliberately syntax-based rather than a catalogue of
// known standards. This keeps the retrieval core independent of an industry,
// publisher, document number, folder, or filename convention. Examples that
// share this shape include standards, regulations and technical specifications.
const STANDARD_PATTERN =
  /\b(?:[A-ZÖ]{2,12}(?:[\s_-]+[A-ZÖ]{2,12}){0,2})[\s_-]*\d{1,6}(?:(?:\s*[-–—/:]\s*)\d{1,6}){1,5}\b/gu;
const COMPACT_LOWERCASE_STANDARD_PATTERN =
  /\b[a-zö]{2,12}\d{1,6}(?:(?:\s*[-–—/:]\s*)\d{1,6}){1,5}\b/gu;

const CLAUSE_PATTERN = /\b\d+(?:\.\d+){1,6}\b/g;

export function normalizeStandardCode(value: string) {
  return value
    .toUpperCase()
    .replace(/Ö/g, "O")
    .replace(/_/g, " ")
    .replace(/([A-Z])(?=\d)/g, "$1 ")
    .replace(/[–—/]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*([:-])\s*/g, "$1")
    .trim();
}

export function standardCodeKey(value: string) {
  return normalizeStandardCode(value).replace(/[^A-Z0-9]/g, "");
}

export function extractStandardCodes(value: unknown) {
  if (typeof value !== "string") return [] as string[];
  const matches = [
    ...(value.match(STANDARD_PATTERN) || []),
    ...(value.match(COMPACT_LOWERCASE_STANDARD_PATTERN) || []),
  ];
  return [...new Set(matches.map(normalizeStandardCode))];
}

export function standardCodesMatch(left: string, right: string) {
  const a = standardCodeKey(left);
  const b = standardCodeKey(right);
  return Boolean(a && b && (a === b || a.endsWith(b) || b.endsWith(a)));
}

export function extractClauseNumbers(value: unknown) {
  if (typeof value !== "string") return [] as string[];
  return [...new Set(value.match(CLAUSE_PATTERN) || [])];
}
