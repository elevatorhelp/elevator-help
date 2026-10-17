import assert from "node:assert/strict";
import { starterActions } from "../app/lib/starter-actions.ts";

assert.equal(starterActions.length, 4, "the landing page must stay focused");
assert.deepEqual(
  starterActions.map((action) => action.label),
  [
    "Troubleshoot a fault",
    "Search technical documentation",
    "What do the standards say about…?",
    "Plan or calculate an elevator",
  ],
);

const serialized = JSON.stringify(starterActions);
assert.doesNotMatch(serialized, /[\p{Extended_Pictographic}]/u);
assert.doesNotMatch(serialized, /EN\s*81|Jobb(?:o|\u00f6)rse/i);

for (const action of starterActions) {
  assert.ok(action.id.trim());
  assert.ok(action.label.trim());
  assert.ok(action.initialQuestion.trim());
}

console.log("starter actions: PASS");
