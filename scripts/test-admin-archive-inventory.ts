import assert from "node:assert/strict";
import { readPublishedEvidenceInventory } from "../app/lib/admin-archive-inventory.ts";

assert.equal(await readPublishedEvidenceInventory(null), null);
const db = {
  prepare(sql: string) {
    assert.equal(sql, "SELECT COUNT(DISTINCT source_file_id) AS indexed_files, COUNT(*) AS evidence_chunks FROM archive_chunks");
    return { first: async () => ({ indexed_files: 122, evidence_chunks: 2800 }) };
  },
};
const rows = await readPublishedEvidenceInventory(db);
assert.equal(rows?.indexedEvidenceFiles, 122);
assert.equal(rows?.evidenceChunks, 2800);
assert.ok(rows?.note.includes("NOT prove raw-vector"));
assert.equal(await readPublishedEvidenceInventory({prepare: () => ({first: async () => ({indexed_files: 123, evidence_chunks: 2})})}), null);
assert.equal(await readPublishedEvidenceInventory({prepare: () => ({first: async () => {throw Error("D1 unavailable");}})}), null);
console.log("Admin D1 evidence inventory read-only fixtures PASS.");
