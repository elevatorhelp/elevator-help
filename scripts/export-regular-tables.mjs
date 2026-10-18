// Offline, regular-table-only D1 backup. Never connects to or writes production.
// Usage: node scripts/export-regular-tables.mjs <source.sql> <output.sql>
// Requires Node 22+ (node:sqlite). The manifest is written beside the output.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, statSync, writeSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const qi = (name) => '"' + String(name).replaceAll('"', '""') + '"';
const digest = (text) => createHash('sha256').update(text).digest('hex');

export function regularTables(db) {
  const types = db.prepare('PRAGMA table_list').all();
  return types.filter((t) => t.schema === 'main' && t.type === 'table' && !t.name.startsWith('sqlite_'))
    .map((t) => {
      const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t.name);
      if (!row?.sql) throw new Error('Missing CREATE TABLE for ' + t.name);
      const columns = db.prepare('PRAGMA table_xinfo(' + qi(t.name) + ')').all();
      const writable = columns.filter((c) => c.hidden === 0);
      if (!writable.length) throw new Error('No writable columns in ' + t.name);
      const primaryKey = writable.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
      return { name: t.name, ddl: row.sql, columns: writable.map((c) => c.name),
        order: t.wr ? primaryKey.map((c) => c.name) : ['rowid'] };
    }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function* inserts(db, table) {
  const cols = table.columns.map(qi);
  const values = cols.map((c, i) => 'quote(' + c + ') AS ' + qi('v' + i));
  const order = table.order.length ? table.order.map(qi).join(',') : cols.join(',');
  const sql = 'SELECT ' + values.join(',') + ' FROM ' + qi(table.name) + ' ORDER BY ' + order;
  for (const row of db.prepare(sql).iterate()) {
    yield 'INSERT INTO ' + qi(table.name) + '(' + cols.join(',') + ') VALUES (' +
      cols.map((_, i) => row['v' + i]).join(',') + ');\n';
  }
}

export function fingerprints(db) {
  return regularTables(db).map((t) => {
    const hash = createHash('sha256');
    let count = 0;
    for (const line of inserts(db, t)) { hash.update(line); count++; }
    return { name: t.name, rows: count, sha256: hash.digest('hex') };
  });
}

export function exportRegularTables(db, outputPath) {
  if (existsSync(outputPath) || existsSync(outputPath + '.manifest.json'))
    throw new Error('Output exists; refusing to overwrite: ' + outputPath);
  const tables = regularTables(db);
  const tmp = outputPath + '.partial';
  if (existsSync(tmp)) throw new Error('Partial output exists; refusing to overwrite: ' + tmp);
  const fd = openSync(tmp, 'wx');
  const manifest = { format: 'sqlite-regular-tables-v1', tables: [], omittedVirtualAndShadow: true };
  const put = (s) => writeSync(fd, s, undefined, 'utf8');
  try {
    put('-- Regular tables only. FTS5 virtual and shadow tables are deliberately omitted.\n');
    put('PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n');
    for (const t of tables) put(t.ddl + ';\n');
    for (const t of tables) {
      const hash = createHash('sha256');
      let rows = 0;
      for (const line of inserts(db, t)) { put(line); hash.update(line); rows++; }
      manifest.tables.push({ name: t.name, rows, sha256: hash.digest('hex') });
    }
    const names = new Set(tables.map((t) => t.name));
    // Preserve AUTOINCREMENT high-water marks even after rows were deleted.
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()) {
      const sequences = db.prepare('SELECT name, seq, quote(name) AS quoted_name FROM sqlite_sequence').all()
        .filter((row) => names.has(row.name));
      manifest.sequences = sequences.map(({ name, seq }) => ({ name, seq }));
      for (const seq of sequences) {
        put('DELETE FROM sqlite_sequence WHERE name=' + seq.quoted_name + ';\n');
        put('INSERT INTO sqlite_sequence(name,seq) VALUES (' + seq.quoted_name + ',' + Number(seq.seq) + ');\n');
      }
    }
    const objects = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('index','trigger','view') AND sql IS NOT NULL ORDER BY type,name").all();
    for (const o of objects) {
      if ((o.type === 'index' || o.type === 'trigger') && !names.has(o.tbl_name)) continue;
      if (o.type === 'view') continue; // views may depend on deliberately omitted virtual tables
      put(o.sql + ';\n');
    }
    put('COMMIT;\n');
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp, outputPath);
  manifest.sqlBytes = statSync(outputPath).size;
  manifest.sqlSha256 = digest(readFileSync(outputPath));
  writeFileSync(outputPath + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output || resolve(source) === resolve(output))
    throw new Error('Usage: node scripts/export-regular-tables.mjs <offline-source.sql> <new-output.sql>');
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(source, 'utf8'));
  const manifest = exportRegularTables(db, resolve(output));
  const check = new DatabaseSync(':memory:');
  check.exec(readFileSync(output, 'utf8'));
  if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
    throw new Error('Export failed restore integrity_check');
  if (JSON.stringify(fingerprints(check)) !== JSON.stringify(manifest.tables))
    throw new Error('Export failed row fingerprint verification');
  console.log(JSON.stringify({ pass: true, tables: manifest.tables.length,
    rows: manifest.tables.reduce((sum, t) => sum + t.rows, 0), output, sha256: manifest.sqlSha256 }));
}
