import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  answerStandardsQuestion,
  isStandardsQuestion,
} from "../app/lib/cortex-standards-engine.ts";
import { createGeminiCallBudget } from "../app/lib/gemini-cost-control.ts";
import {
  extractClauseNumbers,
  extractStandardCodes,
} from "../app/lib/standard-identifiers.ts";

assert.deepEqual(extractStandardCodes("DIN EN 81-70 clause 5.3.2.3"), [
  "DIN EN 81-70",
]);
assert.deepEqual(extractStandardCodes("ISO 25745-2:2015"), [
  "ISO 25745-2:2015",
]);
assert.deepEqual(extractClauseNumbers("see 5.3.2.3 and 7.1"), [
  "5.3.2.3",
  "7.1",
]);
assert.equal(isStandardsQuestion("What does EN 81-70 say?"), true);

const engineSource = readFileSync(
  new URL("../app/lib/cortex-standards-engine.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  engineSource,
  /CORE_STANDARDS|EN\s+81-20|EN\s+81-50/,
  "Cortex standards engine must not contain a fixed standards allow-list",
);

async function scenario({
  question,
  standard,
  clause,
  sourceText,
}: {
  question: string;
  standard: string;
  clause: string;
  sourceText: string;
}) {
  const calls: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes(":batchEmbedContents")) {
      const body = JSON.parse(String(init?.body || "{}"));
      return new Response(
        JSON.stringify({
          embeddings: body.requests.map(() => ({
            values: Array.from({ length: 768 }, (_, index) =>
              index === 0 ? 1 : 0,
            ),
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes(":generateContent")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      claims: [
                        {
                          standard,
                          clause,
                          text: `Verified synthetic requirement ${clause}.`,
                          evidenceIndex: 1,
                          evidenceQuote: sourceText,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const budget = createGeminiCallBudget(5, fakeFetch);
  await budget.fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    { method: "POST", body: "{}" },
  );
  const vectorize = {
    query: async () => ({
      matches: [
        {
          id: "synthetic-source",
          score: 0.98,
          metadata: {
            text: `${clause} ${sourceText}`,
            contentType: "standard",
            fileName: `${standard}.pdf`,
            sourcePath: `/standards/${standard}.pdf`,
            page: 12,
          },
        },
      ],
    }),
  };
  const result = await answerStandardsQuestion(
    question,
    {
      questionLanguage: "en",
      topics: [],
      components: [],
    },
    "test-key",
    { run: async () => ({ data: [[1, 0]] }) },
    vectorize,
    {
      apiKey: "test-key",
      vectorize,
      enabled: true,
      fetchImpl: budget.fetchWithReserve(2),
    },
    budget.fetch,
  );
  return { result, budget: budget.snapshot(), calls };
}

const en8170 = await scenario({
  question: "What does EN 81-70 clause 5.3.2.3 say?",
  standard: "EN 81-70",
  clause: "5.3.2.3",
  sourceText: "Synthetic source states requirement 1200 mm for this test only.",
});
assert.equal(en8170.result.sufficient, true);
assert.deepEqual(en8170.result.checkedStandards, ["EN 81-70"]);
assert.equal(en8170.budget.used, 3);
assert.equal(en8170.budget.remaining, 2);

const iso = await scenario({
  question: "What does ISO 25745-2:2015 clause 7.1 say?",
  standard: "ISO 25745-2:2015",
  clause: "7.1",
  sourceText: "Synthetic source states requirement 42 units for this test only.",
});
assert.equal(iso.result.sufficient, true);
assert.deepEqual(iso.result.checkedStandards, ["ISO 25745-2:2015"]);
assert.equal(iso.budget.used, 3);

console.log(
  "PASS: Cortex discovers standards from evidence and stays within the five-call budget",
);
