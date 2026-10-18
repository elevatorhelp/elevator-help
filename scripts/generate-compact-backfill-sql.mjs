import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { extractClauseNumbers } from '../app/lib/standard-identifiers.ts';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw Error('Usage: node generate-compact-backfill-sql.mjs backup.sql output.sql');
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(source, 'utf8'));
const chunks = db.prepare('SELECT id, text FROM archive_chunks ORDER BY id').all();
const refs = db.prepare('SELECT identifier_key AS key, identifier_label AS label FROM archive_chunk_identifiers WHERE chunk_id=?');
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
let sql = '-- Generated from verified D1 snapshot; insert only missing rows.\n';
for (const chunk of chunks) {
  const identifiers = refs.all(chunk.id);
  const clauses = extractClauseNumbers(chunk.text);
  sql += `INSERT OR IGNORE INTO archive_chunk_search(chunk_id,identifiers_json,clauses_json) VALUES (${q(chunk.id)},${q(JSON.stringify(identifiers))},${q(JSON.stringify(clauses))});\n`;
}
sql += `INSERT OR REPLACE INTO archive_chunk_search_fts(rowid,identifier_keys) SELECT s.rowid,(SELECT group_concat(json_extract(j.value,'$.key'),' ') FROM json_each(s.identifiers_json) j) FROM archive_chunk_search s;\n`;
writeFileSync(destination, sql);
console.log(JSON.stringify({chunks:chunks.length,bytes:Buffer.byteLength(sql),destination}));