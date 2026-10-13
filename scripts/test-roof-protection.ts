import { requiresStandardSafetyCheck } from "../app/lib/query-policy.ts";

for (const question of [
  "Wie hoch muss der Schutz auf dem Kabinendach sein, wenn Absturzgefahr besteht?",
  "Wie hoch muss das Geländer auf dem Fahrkorbdach sein?",
  "How high must the guardrail on the car roof be?",
]) {
  if (!requiresStandardSafetyCheck(question)) {
    throw new Error("Fall-protection height must require standards verification: " + question);
  }
}

for (const question of [
  "Wie reinige ich das Kabinendach?",
  "Wie hoch ist die Kabine für meine Planung?",
]) {
  if (requiresStandardSafetyCheck(question)) {
    throw new Error("Unrelated roof question must not trigger safety guard: " + question);
  }
}

console.log("PASS: car-roof fall-protection safety guard");
