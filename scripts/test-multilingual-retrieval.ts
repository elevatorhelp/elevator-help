import {
  MULTILINGUAL_EMBEDDING_DIMENSIONS,
  embedRetrievalDocuments,
  embedRetrievalQuery,
} from "../app/lib/multilingual-embedding.ts";
import {
  shouldTryInternalRetrieval,
  buildRetrievalQuery,
} from "../app/lib/internal-retrieval.ts";
import { requiresStandardSafetyCheck } from "../app/lib/query-policy.ts";
import { createQueryBackend } from "../app/lib/retrieval-backend.ts";
import {
  deterministicStandardsRoute,
  type RouterResult,
} from "../app/lib/router.ts";

function route(overrides: Partial<RouterResult> = {}): RouterResult {
  return {
    intent: "general_technical",
    evidenceNeed: "direct",
    questionLanguage: "fa",
    preferredSourceLanguage: "de",
    manufacturer: null,
    productFamily: null,
    controller: null,
    faultCode: null,
    faultFamily: null,
    faultName: null,
    topics: ["overspeed governor rope"],
    components: ["governor rope"],
    confidence: "high",
    needsClarification: false,
    clarificationQuestion: null,
    searchStrategy: "semantic_broad",
    normalizedQuestion: "حداقل قطر سیم‌بکسل گاورنر چقدر است؟",
    interpretation: null,
    ...overrides,
  };
}

if (!shouldTryInternalRetrieval(route())) {
  throw new Error(
    "General technical questions must search the internal archive first",
  );
}
if (
  shouldTryInternalRetrieval(
    route({ intent: "standard", evidenceNeed: "standard" }),
  )
) {
  throw new Error(
    "Standards questions must remain on the standards verifier path",
  );
}

for (const question of [
  "Was wäre min Seil Durchmesser?",
  "قطر بکسل گاورنر چقدر باید باشه؟",
  "What is the minimum rope diameter?",
]) {
  if (!requiresStandardSafetyCheck(question)) {
    throw new Error(
      `Safety-critical measurement was not detected: ${question}`,
    );
  }
  const routed = deterministicStandardsRoute(question);
  if (routed?.intent !== "standard" || routed.evidenceNeed !== "standard") {
    throw new Error(`Multilingual standards fallback misrouted: ${question}`);
  }
}
if (requiresStandardSafetyCheck("Hallo, wie geht es dir?")) {
  throw new Error(
    "Ordinary conversation must not enter standards verification",
  );
}

const query = buildRetrievalQuery("قطر بکسل گاورنر چقدر باید باشد؟", route());
if (
  !query.includes("قطر بکسل گاورنر") ||
  !query.includes("overspeed governor rope")
) {
  throw new Error(
    `Semantic router concepts were not preserved in the retrieval query: ${query}`,
  );
}

const sourceVectors = Array.from({ length: 2 }, (_, row) => ({
  values: Array.from(
    { length: MULTILINGUAL_EMBEDDING_DIMENSIONS },
    (_, index) => (index === row ? 2 : 0),
  ),
}));
const calls: any[] = [];
const fakeFetch = async (_url: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body || "{}"));
  calls.push(body);
  const count = body.requests?.length || 0;
  return new Response(
    JSON.stringify({ embeddings: sourceVectors.slice(0, count) }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const documents = await embedRetrievalDocuments(
  ["deutscher Text", "English text"],
  "test",
  fakeFetch as any,
);
if (
  documents.length !== 2 ||
  calls[0].requests.some((item: any) => item.taskType !== "RETRIEVAL_DOCUMENT")
) {
  throw new Error("Document embeddings must use RETRIEVAL_DOCUMENT");
}
const question = await embedRetrievalQuery(
  "سؤال فارسی",
  "test",
  fakeFetch as any,
);
if (calls[1].requests[0].taskType !== "RETRIEVAL_QUERY") {
  throw new Error("Question embeddings must use RETRIEVAL_QUERY");
}
const magnitude = Math.sqrt(
  question.reduce((sum, value) => sum + value * value, 0),
);
if (Math.abs(magnitude - 1) > 1e-9) {
  throw new Error(
    `Truncated Gemini embedding was not normalized: ${magnitude}`,
  );
}

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = fakeFetch as any;
  const legacyIndex = { name: "legacy" };
  const multilingualIndex = { name: "multilingual" };
  const multilingualBackend = await createQueryBackend(
    "Kabinengeländer",
    {
      run: () => {
        throw new Error("Legacy embedding must not run");
      },
    },
    legacyIndex,
    { apiKey: "test", vectorize: multilingualIndex, enabled: true },
  );
  if (
    multilingualBackend.embeddingVersion !== 3 ||
    multilingualBackend.vectorize !== multilingualIndex
  ) {
    throw new Error(
      "Enabled multilingual retrieval did not select the v3 index",
    );
  }

  const legacyBackend = await createQueryBackend(
    "Kabinengeländer",
    { run: async () => ({ data: [[1, 0]] }) },
    legacyIndex,
    { apiKey: "test", vectorize: multilingualIndex, enabled: false },
  );
  if (
    legacyBackend.embeddingVersion !== 2 ||
    legacyBackend.vectorize !== legacyIndex
  ) {
    throw new Error(
      "Disabled multilingual retrieval did not preserve the legacy path",
    );
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS: multilingual retrieval contract");
