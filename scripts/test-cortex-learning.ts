import assert from "node:assert/strict";
import { recordWebResearchCandidate } from "../app/lib/cortex-learning.ts";

const writes: unknown[][] = [];
const database = {
  prepare: (sql: string) => ({
    bind: (...values: unknown[]) => ({
      run: async () => {
        assert.match(sql, /learning_candidates/);
        writes.push(values);
        return { success: true };
      },
    }),
  }),
};

const disabled = await recordWebResearchCandidate({}, {
  queries: ["private user wording"],
  sources: [{ uri: "https://example.com/a", title: "A" }],
});
assert.deepEqual(disabled, { stored: false, reason: "disabled" });

const stored = await recordWebResearchCandidate(
  { CORTEX_LEARNING_ENABLED: "true", CORTEX_DB: database },
  {
    queries: ["generated research query", "generated research query"],
    sources: [{ uri: "https://example.com/a", title: "Primary source" }],
  },
);
assert.equal(stored.stored, true);
assert.equal(writes.length, 1);
assert.equal(writes[0][1], "generated research query");
assert.doesNotMatch(String(writes[0][1]), /private user wording/);

const ungrounded = await recordWebResearchCandidate(
  { CORTEX_LEARNING_ENABLED: "true", CORTEX_DB: database },
  { queries: ["query"], sources: [] },
);
assert.deepEqual(ungrounded, { stored: false, reason: "no-grounded-sources" });

console.log("PASS: web learning stores only grounded research metadata in quarantine");
