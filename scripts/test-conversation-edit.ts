import assert from "node:assert/strict";
import { conversationBeforeMessage } from "../app/lib/conversation-edit.ts";

const messages = [
  { id: 1, role: "user", text: "first" },
  { id: 2, role: "assistant", text: "answer" },
  { id: 3, role: "user", text: "mistyped" },
  { id: 4, role: "assistant", text: "obsolete answer" },
];

assert.deepEqual(conversationBeforeMessage(messages, 3), messages.slice(0, 2));
assert.deepEqual(conversationBeforeMessage(messages, 1), []);
assert.equal(conversationBeforeMessage(messages, 99), null);

console.log("PASS: editing a user message discards only that turn and later turns.");
