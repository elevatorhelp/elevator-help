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
const env = { CORTEX_LEARNING_ENABLED: "true", CORTEX_DB: database };

const disabled = await recordWebResearchCandidate({}, {
  queries: ["private user wording"],
  sources: [{ uri: "https://example.com/a", title: "A" }],
});
assert.deepEqual(disabled, { stored: false, reason: "disabled" });

const stored = await recordWebResearchCandidate(env, {
  queries: ["EN 81-20 cabin roof guard", "EN 81-20 cabin roof guard"],
  sources: [
    {
      uri: "https://example.com/a?email=person%40example.com&token=private#fragment",
      title: "Private customer John Doe",
    },
  ],
});
assert.equal(stored.stored, true);
assert.equal(writes.length, 1);
assert.equal(writes[0][1], "EN 81-20 cabin roof guard");
assert.equal(
  writes[0][2],
  JSON.stringify([{ uri: "https://example.com/a", title: null }]),
);
assert.doesNotMatch(String(writes[0][2]), /email|token|Private|John Doe/);

const mixed = await recordWebResearchCandidate(env, {
  queries: [
    "send to person@example.com for Schindler 5500",
    "KONE elevator error 104",
    "My address is 12345 Munich",
    "call +49 171 1234567 about lift",
    "customer IP 192.168.1.8",
    "passport ABC123",
    "www.example.com private search",
  ],
  sources: [
    { uri: "https://example.com/public", title: "User email: person@example.com" },
    { uri: "https://example.com/users/person@example.com", title: "Sensitive" },
    { uri: "https://user:password@example.com/secret", title: "Credentials" },
    { uri: "http://localhost/internal", title: null },
    { uri: "https://example.com/public?private=yes", title: "Hidden query" },
  ],
});
assert.equal(mixed.stored, true);
assert.equal(writes.length, 2);
assert.equal(writes[1][1], "KONE elevator error 104");
assert.deepEqual(JSON.parse(String(writes[1][2])), [
  { uri: "https://example.com/public", title: null },
  { uri: "https://example.com/public", title: null },
]);

const privacyFiltered = await recordWebResearchCandidate(env, {
  queries: ["contact jane@example.com", "my name is Jane"],
  sources: [{ uri: "https://example.com/a", title: null }],
});
assert.deepEqual(privacyFiltered, { stored: false, reason: "privacy-filtered" });
assert.equal(writes.length, 2);

const unsafeSources = await recordWebResearchCandidate(env, {
  queries: ["DIN EN 81-70"],
  sources: [
    { uri: "https://example.com/users/123", title: null },
    { uri: "https://example.com/a/longsecret_012345678901234567890123456789", title: null },
  ],
});
assert.deepEqual(unsafeSources, { stored: false, reason: "no-safe-sources" });
assert.equal(writes.length, 2);

const ungrounded = await recordWebResearchCandidate(env, {
  queries: ["EN 81-50"], sources: [],
});
assert.deepEqual(ungrounded, { stored: false, reason: "no-safe-sources" });

console.log("PASS: web learning excludes recognizable PII and minimizes persisted source metadata");
