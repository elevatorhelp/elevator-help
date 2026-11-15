import assert from "node:assert/strict";
import {buildQa106ReceiptSql,summarizeQa106Receipts}
 from "./qa-issue106-receipts-readonly.mjs";

const sql=buildQa106ReceiptSql();
assert.match(sql,/SELECT 'A' AS slot/);
assert.match(sql,/UNION ALL SELECT 'B' AS slot/);
assert.match(sql,/ingestion_v2_vector_receipts/);
assert.match(sql,/ingestion_v2_staged_evidence/);
assert.match(sql,/ingestion_v2_document_epochs/);
assert.match(sql,/ingestion_v2_publications/);
assert.ok(!/DELETE\s|UPDATE\s|INSERT\s|DROP\s|ALTER\s/i.test(sql));

const testRows=[
  {slot:"A",epoch_present:1,evidence_current:4,raw_current:0,
    map_current:0,raw_all_epochs:1,published_count:0},
  {slot:"B",epoch_present:1,evidence_current:4,raw_current:2,
    map_current:1,raw_all_epochs:2,published_count:1},
];
const s=summarizeQa106Receipts(testRows);
assert.equal(s.length,2);
assert.equal(s[0].anyOrphanedOldRaw,true);
assert.equal(s[0].rawReceipts,0);
assert.equal(s[1].published,true);
assert.equal(s[1].mapReceipts,1);
assert.ok(!JSON.stringify(s).includes("private-file-name"));
assert.throws(()=>summarizeQa106Receipts([testRows[0]]),/UNEXPECTED_ROWS/);
assert.throws(()=>summarizeQa106Receipts([testRows[0],testRows[0]]),/UNEXPECTED_ROWS/);
assert.throws(()=>summarizeQa106Receipts([
  {...testRows[0],evidence_current:-1},testRows[1]]),/INVALID_COUNTS/);
assert.throws(()=>summarizeQa106Receipts([
  {...testRows[0],raw_current:"private chunk contents"},testRows[1]]),/INVALID_COUNTS/);
console.log("PASS: QA106 read-only evidence, RAW, Map receipt aggregation; no IDs or source text");
