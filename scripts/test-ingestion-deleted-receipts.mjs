import assert from 'node:assert/strict';
import { deletionReceiptIds } from './drive-ingest.mjs';

for (const suffix of ['unknown.pdf', 'manual.docx', 'notes.csv']) {
  const record = {
    name: suffix,
    ids: ['shared', 'raw'], evidenceIds: ['shared', 'evidence'],
    partialRawIds: ['raw-partial'], partialEvidenceIds: ['evidence-partial'],
    mapIds: ['map'], partialMapIds: ['map-partial'],
  };
  assert.deepEqual(new Set(deletionReceiptIds(record)), new Set([
    'shared', 'raw', 'evidence', 'raw-partial', 'evidence-partial', 'map', 'map-partial',
  ]), 'deleting an interrupted document must remove every acknowledged layer');
  assert.equal(deletionReceiptIds(record).length, 7, 'overlapping receipt IDs are deleted once');
}
assert.deepEqual(deletionReceiptIds({partialEvidenceIds: ['orphan']}), ['orphan']);
assert.deepEqual(deletionReceiptIds({ids: null, evidenceIds: 'invalid'}), []);
console.log('PASS: deleted documents include partial evidence receipts and deduplicate all layers');
