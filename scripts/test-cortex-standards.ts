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

for (const [input, expected] of [
  ["ZX 410-22 clause 5.3.2.3", "ZX 410-22"],
  ["ZX410/22 section 5.3.2.3", "ZX 410-22"],
  ["QRS_SPEC_900–7", "QRS SPEC 900-7"],
  ["ISO 25745-2:2015", "ISO 25745-2:2015"],
]) {
  assert.deepEqual(extractStandardCodes(input), [expected]);
}
assert.deepEqual(extractClauseNumbers("see 5.3.2.3 and 7.1"), [
  "5.3.2.3",
  "7.1",
]);
assert.equal(isStandardsQuestion("What does ZX410/22 say?"), true);

const engineSource = readFileSync(
  new URL("../app/lib/cortex-standards-engine.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  engineSource,
  /CORE_STANDARDS|EN\s+81-\d+/,
  "Cortex standards engine must not contain a fixed standards allow-list",
);

async function scenario({
  question,
  standard,
  clause,
  sourceText,
  filteredDecoy = false,
  exactIndex = false,
}: {
  question: string;
  standard: string;
  clause: string;
  sourceText: string;
  filteredDecoy?: boolean;
  exactIndex?: boolean;
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
    query: async (_vector: number[], options: any) => {
      if (filteredDecoy && options?.filter?.contentType === "standard") {
        return {
          matches: [
            {
              id: "classified-decoy",
              score: 0.99,
              metadata: {
                text: "5.3 Unrelated synthetic text.",
                contentType: "standard",
                fileName: "QRS 999-1.pdf",
                sourcePath: "/references/QRS 999-1.pdf",
                page: 1,
              },
            },
          ],
        };
      }
      return {
        matches: [
          {
            id: "synthetic-source",
            score: 0.98,
            metadata: {
              text: `${clause} ${sourceText}`,
              contentType: filteredDecoy ? "general" : "standard",
              fileName: `${standard}.pdf`,
              sourcePath: `/standards/${standard}.pdf`,
              page: 12,
            },
          },
        ],
      };
    },
  };
  const archiveDb = exactIndex
    ? {
        prepare: () => ({
          bind: () => ({
            all: async () => ({
              results: [
                {
                  id: "exact-source",
                  text: `${clause} ${sourceText}`,
                  file_name: `${standard}.pdf`,
                  source_path: `/references/${standard}.pdf`,
                  page: 12,
                  source_fingerprint: "test-fingerprint",
                  identifier_labels: standard,
                },
              ],
            }),
          }),
        }),
      }
    : undefined;
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
    budget.fetch,
    archiveDb,
  );
  return { result, budget: budget.snapshot(), calls };
}

const separatorAgnostic = await scenario({
  question: "What does ZX410/22 clause 5.3.2.3 say?",
  standard: "ZX 410-22",
  clause: "5.3.2.3",
  sourceText: "Synthetic source states requirement 1200 mm for this test only.",
  filteredDecoy: true,
});
assert.equal(separatorAgnostic.result.sufficient, true);
assert.deepEqual(separatorAgnostic.result.checkedStandards, ["ZX 410-22"]);
assert.equal(separatorAgnostic.budget.used, 3);
assert.equal(separatorAgnostic.budget.remaining, 2);

const exactArchive = await scenario({
  question: "What does QRS_SPEC_900–7 clause 4.2.1 say?",
  standard: "QRS SPEC 900-7",
  clause: "4.2.1",
  sourceText: "Synthetic source states requirement 18 units for this test only.",
  exactIndex: true,
});
assert.equal(exactArchive.result.sufficient, true);
assert.deepEqual(exactArchive.result.checkedStandards, ["QRS SPEC 900-7"]);
assert.equal(exactArchive.budget.used, 2);

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
