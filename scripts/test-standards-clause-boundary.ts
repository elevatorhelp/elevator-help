import assert from "node:assert/strict";
import { answerStandardsQuestion } from "../app/lib/cortex-standards-engine.ts";

// Synthetic requirements only; invoke the actual production retrieval/verifier.
for (const [standard, clause, sourceClause, expected] of [
  ["ZX 410-22", "4.2", "4.20", false],
  ["QRS SPEC 900-7", "5.3", "5.3.1", false],
  ["ISO 25745-2:2015", "A.2", "A.20", false],
  ["UV 123-9:2026", "7.1", "7.1", true],
] as const) {
  const quote = "Synthetic requirement for test purposes only.";
  const result = await answerStandardsQuestion(
    `What does ${standard} clause ${clause} say?`, { questionLanguage: "en" },
    "unused-test-key", { run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(() => [1, 0]) }) },
    { query: async () => ({ matches: [{ id: "synthetic", score: 1, metadata: {
      text: `${sourceClause} ${quote}`, standardCode: standard, page: 17,
    } }] }) }, undefined,
    async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{
      text: JSON.stringify({ claims: [{ standard, clause, text: quote,
        evidenceIndex: 1, evidenceQuote: quote }] }),
    }] } }] })),
  );
  assert.equal(result.sufficient, expected,
    `${standard}: source ${sourceClause}, claimed ${clause}`);
  assert.equal(result.verifiedClaims.length, expected ? 1 : 0);
  if (expected) assert.match(result.answer, /PDF page 17/);
}
console.log("PASS: production verifier rejects distinct numeric/nested/annex clauses and retains exact unseen-source citation");
