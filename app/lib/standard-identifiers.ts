const STANDARD_PATTERN =
  /\b(?:(?:DIN|BS|SN|ÖNORM|OENORM)\s+)?(?:EN|ISO|IEC|ASME)\s*\d+(?:\s*[-:]\s*\d+)+(?:\s*[-:]\s*\d{4})?\b/giu;

const CLAUSE_PATTERN = /\b\d+(?:\.\d+){1,6}\b/g;

export function normalizeStandardCode(value: string) {
  return value
    .toUpperCase()
    .replace(/Ö/g, "O")
    .replace(/\s+/g, " ")
    .replace(/\s*([-:])\s*/g, "$1")
    .trim();
}

export function standardCodeKey(value: string) {
  return normalizeStandardCode(value).replace(/[^A-Z0-9]/g, "");
}

export function extractStandardCodes(value: unknown) {
  if (typeof value !== "string") return [] as string[];
  const matches = value.match(STANDARD_PATTERN) || [];
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
