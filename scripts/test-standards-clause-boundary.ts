import assert from "node:assert/strict";
import { answerStandardsQuestion } from "../app/lib/cortex-standards-engine.ts";

// Synthetic fixtures cover a normative clause prefix collision, not a
// particular standard. Exercise real verification through the public engine.
for (const [standard, claimed, actual, accepted] of [
  ["ZX 410-22", "4.2", "4.20", false],
  ["QRS SPEC 900-7", "5.3", "5.3.1", false],
  ["ISO 25745-2:2015", "A.2", "A.20", false],
  ["UV 123-9:2026", "7.1", "7.1", true],
] as const) {
  const quote = "Synthetic requirement for testing source identity only.";
  const result = await answerStandardsQuestion(
    `What does ${standard} clause ${claimed} say?`,
    { questionLanguage: "en" },
    "synthetic-unused-model-key",
    { run: async (_model: string, input: { text: string[] }) =>
      ({ data: input.text.map(() => [1, 0]) }) },
    { query: async () => ({ matches: [{ id: "synthetic", score: 1, metadata: {
      text: `${actual} ${quote}`, standardCode: standard, page: 17,
    } }] }) },
    undefined,
    async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{
      text: JSON.stringify({ claims: [{
        standard, clause: claimed, text: quote, evidenceIndex: 1,
        evidenceQuote: quote,
      }] }),
    }] } }] })),
  );
  assert.equal(result.sufficient, accepted,
    `Claim ${claimed} from source ${actual} should be ${accepted ? "accepted" : "rejected"}`);
  assert.equal(result.verifiedClaims.length, accepted ? 1 : 0);
}
console.log("PASS: exact parsed clause identity, no prefix-only citations");