// Offline characterization of PR #20's actual queryOneStandard control flow.
// No Gemini, Vectorize, network, or production calls are made.
// A passing default run does NOT imply the irrelevant-hit fallback gap is fixed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/lib/standards-engine.ts", import.meta.url),
  "utf8",
);
const start = source.indexOf("async function queryOneStandard(");
const end = source.indexOf("\nasync function retrieveStandards(", start);
assert.ok(start >= 0 && end > start, "Cannot isolate actual queryOneStandard");
assert.equal(
  source.indexOf("async function queryOneStandard(", start + 1),
  -1,
  "Expected exactly one queryOneStandard",
);
const extracted = source.slice(start, end);
const compiled = ts.transpileModule(
  extracted + "\nglobalThis.__queryOneStandard = queryOneStandard;\n",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

async function scenario(multilingualMatches) {
  const calls = [];
  const legacyMatch = { id: "legacy-relevant", score: 0.8 };
  const sandbox = {
    console,
    fetch: async () => { throw new Error("Network must never be used"); },
    discoverMapQueries: async () => [],
    expandQueryPlan: async () => [{ topic: "general", query: "governor rope diameter" }],
    rawMatchesForQuery: async (...args) => {
      const multilingual = Boolean(args[5]?.enabled);
      calls.push({ language: args[2], multilingual });
      return multilingual ? multilingualMatches : [legacyMatch];
    },
    isBroadShaftQuestion: () => false,
    matchKey: (match) => match.id,
    matchRank: (match) => match.score || 0,
  };
  vm.runInNewContext(compiled, sandbox, { timeout: 1000 });
  assert.equal(typeof sandbox.__queryOneStandard, "function");
  const result = await sandbox.__queryOneStandard(
    "What is the minimum governor rope diameter?",
    { preferredSourceLanguage: "de" },
    { code: "EN 81-20" },
    "offline-only",
    {},
    {},
    { enabled: true },
  );
  return { calls, result };
}

const empty = await scenario([]);
assert.equal(empty.calls.filter((call) => call.multilingual).length, 3);
assert.equal(empty.calls.filter((call) => !call.multilingual).length, 1);
assert.equal(empty.result.matches.length, 1);
assert.equal(empty.result.matches[0].id, "legacy-relevant");
assert.equal(empty.result.sourceLanguage, "en");

const irrelevant = await scenario([
  { id: "unrelated-shaft-lighting", score: 0.95 },
]);
assert.equal(irrelevant.result.matches[0].id, "unrelated-shaft-lighting");
assert.equal(irrelevant.calls.filter((call) => !call.multilingual).length, 0);

const relevant = await scenario([
  { id: "relevant-governor-rope", score: 0.95 },
]);
assert.equal(relevant.result.matches[0].id, "relevant-governor-rope");
assert.equal(relevant.calls.filter((call) => !call.multilingual).length, 0);

// Opt-in negative test for the future fix: intentionally FAILS on current PR #20.
// Never mistake the passing characterization above for verified answer relevance.
if (process.argv.includes("--require-relevance-fallback")) {
  assert.equal(
    irrelevant.calls.filter((call) => !call.multilingual).length,
    1,
    "Known gap: an irrelevant nonempty multilingual hit prevents legacy fallback",
  );
}
console.log("PASS: offline legacy fallback control-flow characterization");
console.warn(
  "KNOWN GAP: irrelevant nonempty multilingual hits currently bypass legacy fallback; " +
  "no semantic relevance or normative evidence was validated by this test.",
);
