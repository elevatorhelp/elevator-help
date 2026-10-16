import {
  extractStandardCodes,
  standardCodeKey,
} from "./standard-identifiers.ts";

export type ReferenceIdentifier = {
  key: string;
  label: string;
  structured: boolean;
};

const STRUCTURED_TOKEN =
  /\b(?=[A-Za-z0-9._:/-]{3,40}\b)(?=[A-Za-z0-9._:/-]*[A-Za-z])(?=[A-Za-z0-9._:/-]*\d)[A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*\b/g;
const NUMERIC_RELATION = /\b\d{1,6}\s*[:/]\s*\d{1,6}\b/g;
const NAMED_NUMBER =
  /\b[A-Z][A-Za-z0-9]{2,30}(?:[-_][A-Za-z0-9]{1,20})?\s+\d{2,6}(?:\s*[/:-]\s*\d{1,6})*\b/g;
const CONTEXTUAL_IDENTIFIER =
  /(?:fault|error|code|model|type|series|part(?:\s*(?:no|number))?|fehler|störung|typ|modell|baureihe|artikel(?:nummer)?|referenz|código|modelo|tipo|خطا|کد|مدل|قطعه)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._:/-]{0,30})/giu;

export function normalizeReferenceLabel(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*([._:/-])\s*/g, "$1")
    .replace(/^[-_.:/\s]+|[-_.:/\s]+$/g, "")
    .trim();
}

export function referenceIdentifierKey(value: string) {
  return normalizeReferenceLabel(value).replace(/[^\p{L}\p{N}]/gu, "");
}

export function referenceIdentifiersFromLabels(values: unknown[]) {
  const byKey = new Map<string, ReferenceIdentifier>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const label = normalizeReferenceLabel(value);
    const key = referenceIdentifierKey(label);
    if (label.length < 2 || label.length > 120 || key.length < 2) continue;
    byKey.set(key, { key, label, structured: /\d/.test(label) });
  }
  return [...byKey.values()];
}

export function extractReferenceIdentifiers(
  value: unknown,
  sourceLabels: unknown[] = [],
) {
  const text = typeof value === "string" ? value : "";
  const discovered: string[] = [
    ...extractStandardCodes(text),
    ...(text.match(STRUCTURED_TOKEN) || []),
    ...(text.match(NUMERIC_RELATION) || []),
    ...(text.match(NAMED_NUMBER) || []),
  ];
  for (const match of text.matchAll(CONTEXTUAL_IDENTIFIER)) {
    if (match[1]) discovered.push(match[1]);
  }
  return referenceIdentifiersFromLabels([...discovered, ...sourceLabels]);
}

export function standardReferenceIdentifiers(values: string[]) {
  return values.map((label) => ({
    key: standardCodeKey(label),
    label,
    structured: true,
  }));
}
