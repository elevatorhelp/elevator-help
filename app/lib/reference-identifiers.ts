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
const REVERSED_CONTEXTUAL_IDENTIFIER =
  /\b([A-Za-z0-9][A-Za-z0-9._:/-]{0,30})\s*[-:#]?\s*(?:fault|error|code|model|type|series|fehler|störung|typ|modell|baureihe|referenz|código|modelo|tipo)\b/giu;
const HIERARCHICAL_REFERENCE =
  /\b((?:[A-Za-zÖö]{2,12}[\s_.-]*){1,3})(\d{1,6}(?:[\s_.:/-]+\d{1,6}){1,5})\b/g;

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
  const searchable = [
    text,
    ...sourceLabels.filter((item): item is string => typeof item === "string"),
  ].join("\n");
  const discovered: string[] = [
    ...extractStandardCodes(searchable),
    ...(searchable.match(STRUCTURED_TOKEN) || []),
    ...(searchable.match(NUMERIC_RELATION) || []),
    ...(searchable.match(NAMED_NUMBER) || []),
  ];
  for (const match of searchable.matchAll(CONTEXTUAL_IDENTIFIER)) {
    if (match[1]) discovered.push(match[1]);
  }
  // Manuals use both "error E14" and "E14 error" (and their translated
  // equivalents). Index the referenced token in either order so the lookup is
  // based on the identifier, not on a supplier's label grammar.
  for (const match of searchable.matchAll(REVERSED_CONTEXTUAL_IDENTIFIER)) {
    if (match[1]) discovered.push(match[1]);
  }
  // Filenames commonly append edition/date segments to a useful identifier.
  // Emit every numeric prefix and every authority suffix so a query for the
  // stable identifier resolves a source such as AUTH_SPEC_123_45_2026.pdf.
  for (const match of searchable.matchAll(HIERARCHICAL_REFERENCE)) {
    const authorities = match[1].match(/[A-Za-zÖö]{2,12}/g) || [];
    const numbers = match[2].match(/\d{1,6}/g) || [];
    for (let authorityStart = 0; authorityStart < authorities.length; authorityStart++) {
      for (let numberCount = 2; numberCount <= numbers.length; numberCount++) {
        discovered.push(
          `${authorities.slice(authorityStart).join(" ")} ${numbers
            .slice(0, numberCount)
            .join("-")}`,
        );
      }
    }
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
