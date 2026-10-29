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
// A flattened PDF/OCR chunk can contain consecutive headings from different roots.
// A quote under the later root must not be attributed to the earlier clause.
for (const [source, quote, expected] of [
  ["5.4.7 Earlier requirement. 6.1.1 Synthetic later-root requirement for test purposes only.",
    "Synthetic later-root requirement for test purposes only.", false],
  ["5.4.7 Earlier requirement. 5.4.8 Synthetic later-root requirement for test purposes only.",
    "Synthetic later-root requirement for test purposes only.", false],
  ["5.4.7 Synthetic earlier-root requirement for test purposes only. 6.1.1 Later requirement.",
    "Synthetic earlier-root requirement for test purposes only.", true],
  ["5.4.7 The clearance is 0.70 m; Synthetic requirement after measurement.",
    "Synthetic requirement after measurement.", true],
  ["§5.4.7 Synthetic requirement after a section sign.",
    "Synthetic requirement after a section sign.", true],
] as const) {
  const standard = "UV 123-9:2026";
  const clause = "5.4.7";
  const result = await answerStandardsQuestion(
    `What does ${standard} clause ${clause} say?`, { questionLanguage: "en" },
    "unused-test-key", { run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(() => [1, 0]) }) },
    { query: async () => ({ matches: [{ id: "flattened-synthetic", score: 1, metadata: {
      text: source, standardCode: standard, page: 23,
    } }] }) }, undefined,
    async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{
      text: JSON.stringify({ claims: [{ standard, clause, text: quote,
        evidenceIndex: 1, evidenceQuote: quote }] }),
    }] } }] })),
  );
  assert.equal(result.sufficient, expected, `cross-root flattened PDF: ${source}`);
}
// Numeric requirements must be sourced from the claimed clause, not a neighbor.
for (const [source, expected] of [
  ["5.4.7 Synthetic requirement applies to this component. 6.1.1 Different requirement specifies 1100 mm.", false],
  ["5.4.7 Synthetic requirement applies to this component. The limit is 1100 mm. 6.1.1 Different requirement.", true],
] as const) {
  const standard = "UV 123-9:2026", clause = "5.4.7";
  const quote = "Synthetic requirement applies to this component.";
  const text = "Synthetic requirement applies to this component at 1100 mm.";
  const result = await answerStandardsQuestion(
    `What does ${standard} clause ${clause} say?`, { questionLanguage: "en" },
    "unused-test-key", { run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(() => [1, 0]) }) },
    { query: async () => ({ matches: [{ id: "cross-clause-number", score: 1,
      metadata: { text: source, standardCode: standard, page: 23 } }] }) }, undefined,
    async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{
      text: JSON.stringify({ claims: [{ standard, clause, text, evidenceIndex: 1, evidenceQuote: quote }] }),
    }] } }] })),
  );
  assert.equal(result.sufficient, expected, "numeric evidence must be confined to the claimed clause");
}
console.log("PASS: exact clause boundaries, cross-root attribution and clause-local numeric evidence");
