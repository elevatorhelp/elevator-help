// Validates rollback of all regular D1 tables after FTS5 is present.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportRegularTables, fingerprints, regularTables } from './export-regular-tables.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the pre-FTS D1 SQL snapshot');
const original = new DatabaseSync(':memory:');
original.exec(readFileSync(source, 'utf8'));
const baseline = fingerprints(original);
assert.equal(original.prepare('SELECT COUNT(*) AS n FROM archive_chunks').get().n, 2727);
assert.equal(original.prepare('SELECT COUNT(*) AS n FROM archive_chunk_identifiers').get().n, 121132);
assert.equal(original.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
const originalFks = original.prepare('PRAGMA foreign_key_check').all();

original.exec(readFileSync(new URL('../migrations/0004_archive_search_fts_repair.sql', import.meta.url), 'utf8'));
original.exec("INSERT INTO archive_chunk_search_fts(rowid,identifier_keys) VALUES (990000001,'test_backup_fts')");
assert.ok(original.prepare('PRAGMA table_list').all().some((t) => t.type === 'shadow'));
assert.equal(JSON.stringify(fingerprints(original)), JSON.stringify(baseline), 'FTS must not change regular tables');

// Synthetic edge cases: SQL quotes, multilingual text, BLOB, NULL, generated column, WITHOUT ROWID.
original.exec('CREATE TABLE backup_test (id INTEGER PRIMARY KEY, note TEXT, data BLOB, optional TEXT, computed TEXT GENERATED ALWAYS AS (note || \'!\') VIRTUAL)');
original.prepare('INSERT INTO backup_test(id,note,data,optional) VALUES (?,?,?,?)')
  .run(17, "O'Brien — فارسی — 日本語", Buffer.from([0, 255, 39, 0]), null);
original.exec('CREATE TABLE backup_composite (a TEXT,b INTEGER,value TEXT,PRIMARY KEY(a,b)) WITHOUT ROWID');
original.prepare('INSERT INTO backup_composite VALUES (?,?,?)').run('ß', 3, 'multi-key');
original.exec('CREATE TABLE backup_sequence (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)');
original.exec("INSERT INTO backup_sequence(id,value) VALUES (100,'deleted')");
original.exec('DELETE FROM backup_sequence WHERE id=100');
const before = fingerprints(original);
const directory = mkdtempSync(join(tmpdir(), 'd1-regular-restore-'));
try {
  const path = join(directory, 'regular.sql');
  const manifest = exportRegularTables(original, path);
  assert.deepEqual(manifest.tables, before);
  assert.ok(manifest.tables.length >= baseline.length);
  assert.ok(manifest.sqlBytes > 0);
  const sql = readFileSync(path, 'utf8');
  assert.ok(!sql.includes('CREATE VIRTUAL TABLE'), 'Virtual tables must not be backed up');
  assert.ok(!sql.includes('archive_chunk_search_fts'), 'FTS shadow/virtual names must not leak into backup');
  const restored = new DatabaseSync(':memory:');
  restored.exec(sql);
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), originalFks);
  assert.deepEqual(fingerprints(restored), before, 'All regular table rows must round-trip byte-for-byte');
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM archive_chunks').get().n, 2727);
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM archive_chunk_identifiers').get().n, 121132);
  assert.equal(restored.prepare('SELECT hex(data) AS h, computed, optional FROM backup_test WHERE id=17').get().h, '00FF2700');
  assert.equal(restored.prepare('SELECT value FROM backup_composite WHERE a=? AND b=?').get('ß',3).value, 'multi-key');
  assert.equal(restored.prepare("SELECT seq FROM sqlite_sequence WHERE name='backup_sequence'").get().seq, 100);
  assert.ok(!regularTables(restored).some((t) => t.name.includes('_fts')));
  restored.exec(readFileSync(new URL('../migrations/0004_archive_search_fts_repair.sql', import.meta.url), 'utf8'));
  assert.ok(restored.prepare('PRAGMA table_list').all().some((t) => t.name === 'archive_chunk_search_fts' && t.type === 'virtual'));
  assert.deepEqual(fingerprints(restored), before, 'FTS rebuild must preserve restored regular rows');
  console.log(JSON.stringify({ pass: true, archiveChunks: 2727, identifiers: 121132,
    regularTables: manifest.tables.length, regularRows: before.reduce((sum,t) => sum+t.rows,0),
    backupBytes: manifest.sqlBytes, backupSha256: manifest.sqlSha256,
    integrity: 'ok', foreignKeyViolations: originalFks.length, virtualTablesOmitted: true }));
} finally { rmSync(directory, { recursive: true, force: true }); }
