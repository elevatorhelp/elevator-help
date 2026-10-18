import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { extractClauseNumbers } from '../app/lib/standard-identifiers.ts';
import { standardReferenceIdentifiers } from '../app/lib/reference-identifiers.ts';
import { searchArchiveEvidenceIndex } from '../app/lib/archive-evidence-index.ts';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(process.argv[2], 'utf8'));
const legacyAdapter = { prepare(sql) { return { bind(...args) { return { all: async () => ({ results: db.prepare(sql).all(...args) }) }; } }; } };
const baseline = await searchArchiveEvidenceIndex(legacyAdapter, standardReferenceIdentifiers(['EN 81-71']), [], 5);
assert.ok(baseline.length > 0, 'Missing-FTS fallback must retain legacy retrieval');
db.exec(readFileSync(new URL('../migrations/0004_archive_search_fts_repair.sql', import.meta.url), 'utf8'));
console.log('Loaded offline archive');
const chunks = db.prepare('SELECT id, text FROM archive_chunks').all();
const legacy = db.prepare('SELECT identifier_key AS key, identifier_label AS label FROM archive_chunk_identifiers WHERE chunk_id = ?');
const insert = db.prepare('INSERT OR REPLACE INTO archive_chunk_search(chunk_id,identifiers_json,clauses_json) VALUES (?,?,?)');
const fts = db.prepare('INSERT OR REPLACE INTO archive_chunk_search_fts(rowid,identifier_keys) SELECT rowid,? FROM archive_chunk_search WHERE chunk_id = ?');
let annexChunks = 0;
db.exec('BEGIN');
for (const chunk of chunks) {
  const identifiers = legacy.all(chunk.id);
  const clauses = extractClauseNumbers(chunk.text);
  if (clauses.some((clause) => clause.startsWith('D.'))) annexChunks++;
  insert.run(chunk.id, JSON.stringify(identifiers), JSON.stringify(clauses));
  fts.run(identifiers.map((item) => item.key).join(' '), chunk.id);
}
db.exec('COMMIT');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archive_chunk_search').get().n, chunks.length);
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archive_chunk_search_fts').get().n, chunks.length);
console.log('Offline compact rebuild:', chunks.length, 'chunks; annex chunks:', annexChunks);
const adapter = {
  prepare(sql) {
    return { bind(...args) {
      return { all: async () => ({ results: db.prepare(sql).all(...args) }) };
    }};
  },
};
const matches = await searchArchiveEvidenceIndex(
  adapter, standardReferenceIdentifiers(['EN 81-71']), ['D.7'], 60,
);
assert.ok(matches.length > 0, 'Expected original archived annex section');
assert.ok(matches.some((row) => row.file_name === 'EN_81_71.pdf' && row.text.includes('D.7')));
console.log('PASS: archived annex clause resolved by standard + exact clause');
