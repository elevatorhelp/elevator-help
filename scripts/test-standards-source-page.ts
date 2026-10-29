import assert from "node:assert/strict";
import { answerStandardsQuestion } from "../app/lib/cortex-standards-engine.ts";

// Entirely synthetic; no archive, standard requirements, network or paid calls.
let failures = 0;
for (const standard of ["ZX 410-22", "UV 123-9"]) {
  for (const path of ["semantic", "exact"]) {
  for (const [language, label] of [["en", "PDF page"], ["de", "PDF-Seite"], ["fa", "صفحهٔ PDF"], ["es", "página PDF"], ["xx", "PDF page"]]) {
  for (const page of [undefined, null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1,
    true, false, [], [17], {}, "", " ", "not-a-page", 17, "17", 79]) {
    const expected = page === 17 || page === "17" || page === 79;
    const quote = "Synthetic requirement for test purposes only.";
    const result = await answerStandardsQuestion(
      `What does ${standard} clause 7.1 say?`, { questionLanguage: language },
      "unused-test-key",
      { run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(() => [1, 0]) }) },
      { query: async () => ({ matches: path === "exact" ? [] : [{ id: "synthetic-page", score: 1, metadata: {
        text: `7.1 ${quote}`, standardCode: standard, page,
      } }] }) }, undefined,
      async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{
        text: JSON.stringify({ claims: [{ standard, clause: "7.1", text: quote,
          evidenceIndex: 1, evidenceQuote: quote, page: 999 }] }),
      }] } }] })),
      undefined,
      path === "exact" ? {
        // Only the D1 I/O is stubbed; execute the actual exact-index reader,
        // evidence adapter, verifier and formatter. No publication is active.
        prepare: (sql: string) => ({ bind: (..._args: unknown[]) => ({
          all: async () => ({ results: sql.includes("WITH matched AS") ? [{
            id: "synthetic-exact", text: `7.1 ${quote}`, source_file_id: "synthetic-doc",
            file_name: standard, page, identifier_labels: standard,
          }] : [] }),
        }) }),
      } : undefined,
    );
    try {
      assert.equal(result.sufficient, expected, `${path} ${standard}: source page ${JSON.stringify(page)}`);
      assert.equal(result.verifiedClaims.length, expected ? 1 : 0);
      if (expected) {
        assert.equal(result.verifiedClaims[0].page, Number(page));
        assert.ok(result.answer.includes(`${label} ${page}`), `${path} ${language}: missing explicit PDF label`);
        assert.doesNotMatch(result.answer, /(?:p\.|S\.) (?:17|79)|73/);
        assert.doesNotMatch(result.answer, /999/);
      }
    } catch (error) { failures++; console.error((error as Error).message); }
  }
  }
}
}


// A multi-clause PDF chunk must not attribute another clause's quote to 7.1.
for (const path of ["semantic", "exact"]) {
  for (const wrongClause of [false, true]) {
  for (const secondClause of ["7.2", "8.1"]) {
    const standard = "ZX 410-22";
    const quoteOne = "First clause synthetic technical requirement.";
    const quoteTwo = "Second clause synthetic technical requirement.";
    const excerpt = `7.1 ${quoteOne}\n${secondClause} ${quoteTwo}`;
    const quote = wrongClause ? quoteTwo : quoteOne;
    const result = await answerStandardsQuestion(
      `What does ${standard} clause 7.1 say?`, { questionLanguage: "en" },
      "unused-test-key",
      { run: async (_model: string, input: { text: string[] }) => ({ data: input.text.map(() => [1, 0]) }) },
      { query: async () => ({ matches: path === "exact" ? [] : [{ id: "multi-clause", score: 1, metadata: { text: excerpt, standardCode: standard, page: 17 } }] }) },
      undefined,
      async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ claims: [{
        standard, clause: "7.1", text: quote, evidenceIndex: 1, evidenceQuote: quote,
      }] }) }] } }] })),
      undefined,
      path === "exact" ? { prepare: (sql: string) => ({ bind: (..._args: unknown[]) => ({
        all: async () => ({ results: sql.includes("WITH matched AS") ? [{
          id: "multi-clause-exact", text: excerpt, source_file_id: "synthetic-doc",
          file_name: standard, page: 17, identifier_labels: standard,
        }] : [] }),
      }) }) } : undefined,
    );
    try {
      assert.equal(result.sufficient, !wrongClause, `multi-clause ${path}, wrongClause=${wrongClause}`);
      assert.equal(result.verifiedClaims.length, wrongClause ? 0 : 1);
    } catch (error) { failures++; console.error((error as Error).message); }
  }
  }
}

assert.equal(failures, 0, "source page regressions");
console.log("PASS: 340 multilingual exact/semantic source-page cases plus 8 cross-clause attribution cases (348 total); absent/invalid pages fail closed, valid source pages preserved, model page ignored");
