type GermanElevatorTerm = { stem: string; term: string };

const STRONG_TERMS: GermanElevatorTerm[] = [
  { stem: "aufzug", term: "Aufzug" },
  { stem: "fahrkorb", term: "Fahrkorb" },
  { stem: "schacht", term: "Schacht" },
  { stem: "gegengewicht", term: "Gegengewicht" },
  { stem: "fangvorrichtung", term: "Fangvorrichtung" },
  { stem: "treibscheibe", term: "Treibscheibe" },
  { stem: "führungsschiene", term: "Führungsschiene" },
  { stem: "notruf", term: "Notruf" },
];

const SUPPORTING_TERMS: GermanElevatorTerm[] = [
  { stem: "kabin", term: "Kabine" },
  { stem: "geländer", term: "Geländer" },
  { stem: "dach", term: "Dach" },
  { stem: "wand", term: "Wand" },
  { stem: "tür", term: "Tür" },
  { stem: "schwelle", term: "Schwelle" },
  { stem: "steuerung", term: "Steuerung" },
  { stem: "bremse", term: "Bremse" },
  { stem: "seil", term: "Seil" },
  { stem: "puffer", term: "Puffer" },
  { stem: "führung", term: "Führung" },
  { stem: "schiene", term: "Schiene" },
  { stem: "antrieb", term: "Antrieb" },
  { stem: "maschine", term: "Maschine" },
  { stem: "grube", term: "Grube" },
  { stem: "überfahrt", term: "Überfahrt" },
  { stem: "licht", term: "Licht" },
  { stem: "wartung", term: "Wartung" },
  { stem: "system", term: "System" },
  { stem: "taster", term: "Taster" },
  { stem: "tableau", term: "Tableau" },
];

const EXACT_STRONG_WORDS = new Set([
  "aufzug",
  "aufzüge",
  "fahrkorb",
  "fahrkörbe",
  "schacht",
  "schächte",
  "gegengewicht",
  "gegengewichte",
  "fangvorrichtung",
  "fangvorrichtungen",
  "treibscheibe",
  "treibscheiben",
  "führungsschiene",
  "führungsschienen",
  "notruf",
]);

function germanTokens(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("de-DE").match(/\p{L}{4,}/gu) || [];
}

export function analyzeGermanElevatorLanguage(value: string) {
  const terms = new Set<string>();
  let exactStrongWord = false;

  for (const token of germanTokens(value)) {
    if (EXACT_STRONG_WORDS.has(token)) exactStrongWord = true;
    for (const candidate of [...STRONG_TERMS, ...SUPPORTING_TERMS]) {
      if (token.includes(candidate.stem)) terms.add(candidate.term);
    }
  }

  return {
    technical: exactStrongWord || terms.size >= 2,
    terms: [...terms],
  };
}

export function isGermanElevatorTechnical(value: string) {
  return analyzeGermanElevatorLanguage(value).technical;
}

export function germanElevatorSearchTerms(value: string) {
  const analysis = analyzeGermanElevatorLanguage(value);
  return analysis.technical ? analysis.terms : [];
}
