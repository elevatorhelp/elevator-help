// Offline regression for the REAL standards retrieval and answer control flow.
// Synthetic excerpts below are test fixtures, NOT statements of real standards.
// No network, Gemini, Cloudflare, or Vectorize calls are performed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/lib/standards-engine.ts", import.meta.url), "utf8");
const begin = source.indexOf("async function queryOneStandard(");
const middle = source.indexOf("\nfunction clauseLabel(", begin);
const answer = source.indexOf("export async function answerStandardsQuestion(");
assert.ok(begin >= 0 && middle > begin && answer > middle);
const extracted = source.slice(begin, middle) + "\n" +
  source.slice(answer).replace("export async function answerStandardsQuestion(", "async function answerStandardsQuestion(") +
  "\nglobalThis.__answer = answerStandardsQuestion;\n";
const compiled = ts.transpileModule(extracted, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const lighting = {
  id: "MULTI_LIGHT", score: 0.96,
  metadata: { text: "5.2.1.4 Synthetic lighting rule: shaft lighting shall be at least 30 lux. MULTI_LIGHT" },
};
const multilingualRope = {
  id: "MULTI_ROPE", score: 0.91,
  metadata: { text: "5.6.3.2 Synthetic governor rope rule: diameter at least 7 mm. MULTI_ROPE" },
};
const legacyRope = {
  id: "LEGACY_ROPE", score: 0.75,
  metadata: { text: "5.6.3.2 Synthetic governor rope rule: diameter at least 7 mm. LEGACY_ROPE" },
};
const standards = [
  { code: "EN 81-20", compact: "EN8120" },
  { code: "EN 81-50", compact: "EN8150" },
];

function validClaim(kind, language) {
  if (kind === "lighting") return {
    standard: "EN 81-20", clause: "5.2.1.4", topic: "general",
    text: "Synthetic lighting at least 30 lux.", evidenceId: 1,
    evidenceQuote: "shaft lighting shall be at least 30 lux",
  };
  const texts = {
    en: "Synthetic governor rope minimum diameter 7 mm.",
    de: "Synthetischer Geschwindigkeitsbegrenzerseil-Mindestdurchmesser 7 mm.",
    fa: "قطر حداقل سیم‌بکسل گاورنر در دادهٔ آزمایشی 7 mm است.",
    nl: "Synthetische minimumdiameter van de snelheidsbegrenzerkabel is 7 mm.",
  };
  return {
    standard: "EN 81-20", clause: "5.6.3.2", topic: "general",
    text: texts[language] || texts.en, evidenceId: 1,
    evidenceQuote: "Synthetic governor rope rule: diameter at least 7 mm",
  };
}

async function scenario({
  mode = "irrelevant", language = "en", embeddingFailure = false,
  emptyLegacy = false, exhaustRetry = false, malformedModel = false,
  disableRetry = false, invalidNumber = false,
} = {}) {
  const calls = [];
  let syntheses = 0;
  const sandbox = {
    console: { error() {}, warn() {}, log() {} },
    fetch: async () => { throw new Error("Real network call forbidden"); },
    CORE_STANDARDS: standards,
    discoverMapQueries: async () => [],
    expandQueryPlan: async () => [{ topic: "general", query: "synthetic governor rope" }],
    rawMatchesForQuery: async (...args) => {
      const isMulti = Boolean(args[5]?.enabled);
      const code = args[1].code;
      calls.push({ isMulti, code });
      if (code === "EN 81-50") return [];
      if (isMulti && embeddingFailure) throw new Error("Synthetic embedding failure");
      if (isMulti) {
        return mode === "empty" ? [] :
          mode === "relevant" ? [multilingualRope] : [lighting];
      }
      return emptyLegacy ? [] : [legacyRope];
    },
    isBroadShaftQuestion: () => false,
    explicitlyNamedCoreStandards: () => [],
    matchKey: (match) => match.id,
    matchRank: (match) => match.score || 0,
    deterministicClearanceClaims: () => [],
    formatAnswer: async (_question, claims) => claims.map((claim) => claim.text).join("; "),
    unverifiedMessage: () => "UNVERIFIED",
    parseModelJson: (value) => JSON.parse(value),
  };
  vm.runInNewContext(compiled, sandbox, { timeout: 1000 });
  assert.equal(typeof sandbox.__answer, "function");

  const fakeFetch = async (_url, request) => {
    syntheses += 1;
    if (exhaustRetry && syntheses === 2) {
      const error = new Error("Synthetic Gemini budget exhausted");
      error.name = "GeminiCallBudgetExceededError";
      throw error;
    }
    const prompt = JSON.parse(request.body).contents[0].parts[0].text;
    let result;
    if (malformedModel) {
      result = { claims: [validClaim("rope", language)] };
    } else if (prompt.includes("MULTI_LIGHT")) {
      // This is a normatively valid, but QUESTION-IRRELEVANT synthetic claim.
      result = { relevantEvidenceIds: [], claims: [validClaim("lighting", language)] };
    } else if (prompt.includes("MULTI_ROPE") || prompt.includes("LEGACY_ROPE")) {
      const claim = validClaim("rope", language);
      if (invalidNumber) claim.text = "Synthetic governor rope minimum diameter 99 mm.";
      result = { relevantEvidenceIds: [1], claims: [claim] };
    } else {
      result = { relevantEvidenceIds: [], claims: [] };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
      }),
    };
  };
  const question = {
    en: "What is the minimum governor rope diameter?",
    de: "Welchen Mindestdurchmesser muss das Begrenzerseil haben?",
    fa: "حداقل قطر سیم‌بکسل گاورنر چقدر است؟",
    nl: "Wat is de minimale diameter van de snelheidsbegrenzerkabel?",
  }[language];
  const result = await sandbox.__answer(
    question,
    { preferredSourceLanguage: language, questionLanguage: language,
      disableLegacyEvidenceRetry: disableRetry },
    "OFFLINE_ONLY", {}, {}, { enabled: true }, fakeFetch, fakeFetch,
  );
  return { result, calls, syntheses };
}

const irrelevant = await scenario();
assert.equal(irrelevant.result.sufficient, true, "Irrelevant multilingual evidence must trigger legacy retry");
assert.match(irrelevant.result.answer, /7 mm/);
assert.equal(irrelevant.syntheses, 2);
assert.equal(irrelevant.calls.filter((x) => !x.isMulti && x.code === "EN 81-20").length, 1);

const relevant = await scenario({ mode: "relevant" });
assert.equal(relevant.result.sufficient, true);
assert.equal(relevant.syntheses, 1, "Relevant multilingual result must not trigger retry");
assert.equal(relevant.calls.filter((x) => !x.isMulti && x.code === "EN 81-20").length, 0);

const empty = await scenario({ mode: "empty" });
assert.equal(empty.result.sufficient, true);
assert.equal(empty.syntheses, 1);
assert.equal(empty.calls.filter((x) => !x.isMulti && x.code === "EN 81-20").length, 1);

const failedEmbedding = await scenario({ embeddingFailure: true });
assert.equal(failedEmbedding.result.sufficient, true);
assert.equal(failedEmbedding.syntheses, 1);
assert.equal(failedEmbedding.calls.filter((x) => !x.isMulti && x.code === "EN 81-20").length, 1);

const noLegacy = await scenario({ emptyLegacy: true });
assert.equal(noLegacy.result.sufficient, false);
assert.equal(noLegacy.syntheses, 1, "No second paid synthesis without legacy evidence");

const exhausted = await scenario({ exhaustRetry: true });
assert.equal(exhausted.result.sufficient, false, "Budget exhaustion must fail closed");
assert.equal(exhausted.syntheses, 2, "Budget exhaustion must not recurse");

const malformed = await scenario({ malformedModel: true });
assert.equal(malformed.result.sufficient, false);
assert.equal(malformed.syntheses, 1, "Missing semantic relevance assessment must fail closed");

const disabled = await scenario({ disableRetry: true });
assert.equal(disabled.result.sufficient, false);
assert.equal(disabled.syntheses, 1);

const invalid = await scenario({ mode: "relevant", invalidNumber: true });
assert.equal(invalid.result.sufficient, false, "Normative number not in source must be rejected");

for (const language of ["de", "fa", "nl"]) {
  const translated = await scenario({ language });
  assert.equal(translated.result.sufficient, true, "Retry failed for " + language);
  assert.equal(translated.syntheses, 2);
  assert.match(translated.result.answer, /7 mm/);
}
console.log("PASS: offline evidence-aware bounded standards retry (12 scenarios)");
