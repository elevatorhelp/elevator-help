// Validate the compact backfill SQL on an actual D1 export, without cloud writes.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { extractClauseNumbers } from '../app/lib/standard-identifiers.ts';
const exportPath = process.argv[2];
if (!exportPath) throw new Error('Provide a verified D1 SQL export path');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(exportPath, 'utf8'));
db.exec(readFileSync(new URL('../migrations/0004_archive_search_fts_repair.sql', import.meta.url), 'utf8'));
const pendingSql = `SELECT c.id, c.text, c.updated_at FROM archive_chunks AS c
  WHERE NOT EXISTS (SELECT 1 FROM archive_chunk_search AS s WHERE s.chunk_id = c.id)
    OR EXISTS (SELECT 1 FROM archive_chunk_search AS s WHERE s.chunk_id = c.id
      AND NOT EXISTS (SELECT 1 FROM archive_chunk_search_fts AS f WHERE f.rowid = s.rowid))
  ORDER BY c.id LIMIT 1`;
const insert = db.prepare(`INSERT INTO archive_chunk_search(chunk_id, identifiers_json, clauses_json)
  SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM archive_chunks WHERE id=? AND updated_at=?)
  AND NOT EXISTS (SELECT 1 FROM archive_chunk_search WHERE chunk_id=?)`);
const fts = db.prepare(`INSERT OR REPLACE INTO archive_chunk_search_fts(rowid, identifier_keys)
  SELECT s.rowid, (SELECT group_concat(json_extract(j.value,'$.key'),' ') FROM json_each(s.identifiers_json) AS j)
  FROM archive_chunk_search AS s WHERE s.chunk_id=?`);
const row = db.prepare(pendingSql).get();
assert.ok(row, 'Expected at least one pending chunk');
const refs = db.prepare('SELECT identifier_key AS key, identifier_label AS label FROM archive_chunk_identifiers WHERE chunk_id=?').all(row.id);
assert.ok(refs.length, 'Expected legacy references for fixture chunk');
const payload = [row.id, JSON.stringify(refs), JSON.stringify(extractClauseNumbers(row.text)), row.id, row.updated_at, row.id];
// An obsolete snapshot cannot overwrite a concurrently modified source chunk.
const changed = db.prepare('UPDATE archive_chunks SET updated_at=updated_at+1 WHERE id=?');
changed.run(row.id);
assert.equal(insert.run(...payload).changes, 0, 'Stale-source guard failed');
db.prepare('UPDATE archive_chunks SET updated_at=? WHERE id=?').run(row.updated_at, row.id);
assert.equal(insert.run(...payload).changes, 1, 'First insertion should succeed');
fts.run(row.id);
assert.equal(insert.run(...payload).changes, 0, 'Second insertion must be idempotent');
assert.equal(db.prepare('SELECT count(*) AS n FROM archive_chunk_search_fts').get().n, 1);
assert.notEqual(db.prepare(pendingSql).get()?.id, row.id, 'Completed chunk must not be pending');
console.log('PASS: offline D1 backfill guards source version, resumes, and avoids duplicate inserts');
db.close();
