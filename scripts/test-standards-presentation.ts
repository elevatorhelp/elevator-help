import { formatGermanStandardsAnswer } from "../app/lib/standards-engine.ts";

const answer = formatGermanStandardsAnswer([
  {
    standard: "EN 81-20",
    clause: "5.2.5.3.1",
    topic: "structure",
    text: "Der horizontale Abstand darf grundsätzlich 0,15 m nicht überschreiten.",
  },
  {
    standard: "EN 81-20",
    clause: "5.3.4.1",
    topic: "access",
    text: "Der horizontale Abstand darf 35 mm nicht überschreiten.",
  },
]);

const expectedHeading = "Kurz gesagt – das schreibt die Norm vor:";
if (!answer.startsWith(expectedHeading + "\n• EN 81-20, Abschnitt 5.2.5.3.1")) {
  throw new Error(`Unexpected German standards heading or first bullet:\n${answer}`);
}
if (!answer.includes("• EN 81-20, Abschnitt 5.3.4.1")) {
  throw new Error(`Second clause is missing:\n${answer}`);
}
if (/Was die Norm konkret sagt|page numbers?|sources?|references?/i.test(answer)) {
  throw new Error(`Redundant heading or prompt leakage detected:\n${answer}`);
}

console.log("PASS: deterministic German standards presentation");
