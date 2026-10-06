import {
  analyzeGermanElevatorLanguage,
  germanElevatorSearchTerms,
} from "../app/lib/german-language.ts";
import {
  addWebSourceLabel,
  webSourceLabel,
} from "../app/lib/source-label.ts";

const cases: Array<[string, boolean, string[]]> = [
  ["Kabinengeländer", true, ["Kabine", "Geländer"]],
  ["Fahrkorbdachgeländer", true, ["Fahrkorb", "Dach", "Geländer"]],
  ["Aufzugsschachtwand", true, ["Aufzug", "Schacht", "Wand"]],
  ["Kabinentürsteuerung", true, ["Kabine", "Tür", "Steuerung"]],
  ["Schachttür", true, ["Schacht", "Tür"]],
  ["Wie hoch muss das Kabinengeländer sein?", true, ["Kabine", "Geländer"]],
  ["Das Geländer ist schön", false, []],
  ["Die Tür ist offen", false, []],
  ["Wir fahren in den Urlaub", false, []],
  ["Kabinenurlaub", false, []],
  ["Eine Schachtel mit Werkzeug", false, []],
];

for (const [question, expectedTechnical, expectedTerms] of cases) {
  const analysis = analyzeGermanElevatorLanguage(question);
  if (analysis.technical !== expectedTechnical) {
    throw new Error(`${question}: expected technical=${expectedTechnical}, got ${analysis.technical}`);
  }
  const searchTerms = germanElevatorSearchTerms(question);
  for (const expectedTerm of expectedTerms) {
    if (!searchTerms.includes(expectedTerm)) {
      throw new Error(`${question}: expected search term ${expectedTerm}, got ${searchTerms.join(", ")}`);
    }
  }
  if (!expectedTechnical && searchTerms.length) {
    throw new Error(`${question}: non-technical text leaked search terms ${searchTerms.join(", ")}`);
  }
}

console.log(`PASS: ${cases.length} German compound-language cases`);

const sourceLabels = {
  de: "Quelle: Web-Recherche",
  en: "Source: Web research",
  es: "Fuente: búsqueda web",
  fa: "منبع: جست‌وجوی وب",
};

for (const [language, expected] of Object.entries(sourceLabels)) {
  if (webSourceLabel(language) !== expected) {
    throw new Error(`${language}: expected source label ${expected}`);
  }
  const answer = addWebSourceLabel("Antwort\n\nWeb-based", language);
  if (answer !== `Antwort\n\n${expected}`) {
    throw new Error(`${language}: unexpected formatted answer ${answer}`);
  }
}

console.log("PASS: localized web source labels");
