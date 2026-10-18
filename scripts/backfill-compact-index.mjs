// Rebuild compact evidence from existing D1 rows without Gemini or re-embedding.
// Dry-run is the default; writes require an explicit --execute flag.
import { extractClauseNumbers } from '../app/lib/standard-identifiers.ts';
import { extractReferenceIdentifiers } from '../app/lib/reference-identifiers.ts';

const execute = process.argv.includes('--execute');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const database = process.env.D1_DATABASE_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !database || !token) throw new Error('Missing Cloudflare D1 credentials');
if (execute && !process.argv.includes(`--confirm-database=${database}`)) {
  throw new Error('Explicit matching --confirm-database=<D1_DATABASE_ID> is required for writes');
}
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
const batchSize = Math.max(1, Math.min(16, Number(process.env.BACKFILL_BATCH_SIZE || 8)));
const maxBatches = Math.max(1, Math.min(1000, Number(process.env.BACKFILL_MAX_BATCHES || 1)));
async function query(payload) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    const result = await response.json();
    if (response.ok && result.success && result.result?.every((item) => item.success)) return result.result;
    if (response.status !== 429 && response.status < 500) throw new Error(`D1 API error ${response.status}: ${JSON.stringify(result.errors || [])}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error('D1 API unavailable after retries');
}
const read = async (sql, params = []) => (await query({ sql, params }))[0]?.results || [];
const schema = await read("SELECT name FROM sqlite_master WHERE name IN ('archive_chunk_search','archive_chunk_search_fts')");
const names = new Set(schema.map((row) => row.name));
if (!names.has('archive_chunk_search') || !names.has('archive_chunk_search_fts')) {
  throw new Error('Compact index schema incomplete: apply the reviewed migration before backfill');
}
const pendingSql = `
  SELECT c.id, c.text, c.file_name, c.source_path, c.updated_at,
    (SELECT json_group_array(json_object('key', i.identifier_key, 'label', i.identifier_label))
     FROM archive_chunk_identifiers AS i WHERE i.chunk_id = c.id) AS legacy_refs
  FROM archive_chunks AS c
  WHERE NOT EXISTS (SELECT 1 FROM archive_chunk_search AS s WHERE s.chunk_id = c.id)
    OR EXISTS (SELECT 1 FROM archive_chunk_search AS s WHERE s.chunk_id = c.id
      AND NOT EXISTS (SELECT 1 FROM archive_chunk_search_fts AS f WHERE f.rowid = s.rowid))
  ORDER BY c.id LIMIT ?`;
const insertSql = `INSERT INTO archive_chunk_search(chunk_id,identifiers_json,clauses_json)
  SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM archive_chunks WHERE id=? AND updated_at=?)
  AND NOT EXISTS (SELECT 1 FROM archive_chunk_search WHERE chunk_id=?)`;
const ftsSql = `INSERT OR REPLACE INTO archive_chunk_search_fts(rowid,identifier_keys)
  SELECT s.rowid, (SELECT group_concat(json_extract(j.value,'$.key'),' ') FROM json_each(s.identifiers_json) AS j)
  FROM archive_chunk_search AS s WHERE s.chunk_id=?`;
let processed = 0;
for (let batch = 0; batch < maxBatches; batch++) {
  const rows = await read(pendingSql, [String(batchSize)]);
  if (!rows.length) break;
  const statements = [];
  for (const row of rows) {
    const existing = JSON.parse(row.legacy_refs || '[]');
    const identifiers = existing.length ? existing : extractReferenceIdentifiers(row.text, [row.file_name, row.source_path]);
    const clauses = extractClauseNumbers(row.text);
    statements.push({ sql: insertSql, params: [row.id, JSON.stringify(identifiers), JSON.stringify(clauses), row.id, String(row.updated_at), row.id] });
    statements.push({ sql: ftsSql, params: [row.id] });
  }
  if (!execute) {
    console.log(JSON.stringify({mode:'dry-run', batch:batch+1, wouldProcess:rows.length, exampleClauseCount:extractClauseNumbers(rows[0].text).length}));
    break;
  }
  for (const statement of statements) await query(statement);
  processed += rows.length;
  console.log(JSON.stringify({mode:'execute', batch:batch+1, processed}));
}
console.log(JSON.stringify({done:true, execute, processed}));
