// Offline functional regression for PR #20. The irrelevant-evidence case is
// intentionally RED until a safe, bounded relevance-aware fallback is implemented.
// This test executes the extracted queryOneStandard function, not a rewritten copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as ts from "typescript";

const source = readFileSync(
  new URL("../app/lib/standards-engine.ts", import.meta.url),
  "utf8",
);
const begin = source.indexOf("async function queryOneStandard(");
const end = source.indexOf("\nasync function retrieveStandards(", begin);
assert.ok(begin >= 0 && end > begin, "Cannot locate queryOneStandard source");
const executable = ts.transpileModule(
  `${source.slice(begin, end)}\nglobalThis.__queryOneStandard = queryOneStandard;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

const irrelevant = {
  id: "unrelated-sill-clearance",
  score: 0.97,
  metadata: { text: "EN 81-20 clause 5.3.4.1: landing door sill clearance" },
};
const relevant = {
  id: "governor-rope-evidence",
  score: 0.82,
  metadata: { text: "EN 81-20: overspeed governor rope requirements" },
};

async function exercise(mode: "empty" | "irrelevant" | "relevant") {
  const calls = { multilingual: 0, legacy: 0 };
  const context: Record<string, any> = {
    console,
    fetch: async () => { throw new Error("Network access is forbidden in offline QA"); },
    discoverMapQueries: async () => [],
    expandQueryPlan: async () => [{ topic: "general", query: "governor rope diameter" }],
    rawMatchesForQuery: async (
      _item: unknown, _standard: unknown, _language: string,
      _ai: unknown, _vectorize: unknown, multilingual?: { enabled: boolean },
    ) => {
      if (multilingual?.enabled) {
        calls.multilingual++;
        return mode === "empty" ? [] : [mode === "irrelevant" ? irrelevant : relevant];
      }
      calls.legacy++;
      return [relevant];
    },
    matchKey: (match: { id: string }) => match.id,
    matchRank: (match: { score: number }) => match.score,
    isBroadShaftQuestion: () => false,
  };
  runInNewContext(executable, context, { timeout: 1000 });
  const answer = await context.__queryOneStandard(
    "Welchen Durchmesser braucht das Seil des Geschwindigkeitsbegrenzers?",
    { preferredSourceLanguage: "de" },
    { code: "EN 81-20" },
    "offline-test", {}, {}, { enabled: true, vectorize: {} },
  );
  return { answer, calls };
}

const empty = await exercise("empty");
assert.equal(empty.calls.multilingual, 3, "Expected bounded de/de-en/en probing");
assert.equal(empty.calls.legacy, 1, "Empty multilingual results must probe legacy exactly once");
assert.equal(empty.answer.matches[0]?.id, relevant.id);

const good = await exercise("relevant");
assert.equal(good.calls.legacy, 0, "Relevant multilingual evidence needs no legacy probe");
assert.equal(good.answer.matches[0]?.id, relevant.id);

const misleading = await exercise("irrelevant");
assert.equal(
  misleading.calls.legacy,
  1,
  "KNOWN GAP: nonempty irrelevant multilingual evidence suppresses legacy fallback",
);
assert.equal(
  misleading.answer.matches[0]?.id,
  relevant.id,
  "Irrelevant multilingual evidence must not mask relevant legacy evidence",
);
console.log("PASS: empty, relevant, and irrelevant multilingual fallback paths");
