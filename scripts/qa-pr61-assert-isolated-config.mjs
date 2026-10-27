/**
 * Fail-closed guard before ANY remote D1 mutation or QA Worker deployment.
 * This does not authorize the Cloudflare write or prove account isolation.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const D1_ID = '02716877-15e3-4478-9e24-f1ba6e5dfb00';
const VECTOR_BINDINGS = {
  VECTORIZE: 'elevator-help-staging-test',
  VECTORIZE_V2: 'elevator-help-staging-test-v2',
};
const ALLOWED_KEYS = new Set([
  '$schema', 'name', 'main', 'compatibility_date', 'compatibility_flags',
  'assets', 'd1_databases', 'observability', 'vars', 'ratelimits',
  'ai', 'vectorize', 'workers_dev',
]);
const ALLOWED_VARS = new Set([
  'AUTH_REQUIRED', 'INGESTION_STAGED_PUBLICATION',
  'INGESTION_COMPLETE_PUBLICATION', 'QA_EXACT_EVIDENCE_LOOKUP',
  'INGESTION_LEASE_PREFLIGHT', 'GEMINI_MAX_CALLS_PER_INGEST_REQUEST',
]);

export function assertIsolatedQaConfig(config, mode) {
  assert.ok(mode === 'deployed' || mode === 'local', 'unknown QA config mode');
  assert.ok(config && typeof config === 'object' && !Array.isArray(config));
  for (const key of Object.keys(config)) {
    assert.ok(ALLOWED_KEYS.has(key), `unreviewed Wrangler setting: ${key}`);
  }
  assert.equal(config.name, 'elevator-help-pr61-app-qa');
  assert.equal(config.main, mode === 'deployed'
    ? 'workers/qa-real-app-entry.mjs' : '.open-next/worker.js');
  assert.equal(config.assets?.directory, '.open-next/assets');
  assert.equal(config.assets?.binding, 'ASSETS');
  assert.deepEqual(config.d1_databases, [{
    binding: 'CORTEX_DB', database_name: 'elevator-help-lease-test-01', database_id: D1_ID,
  }], 'must target only approved disposable QA D1');
  assert.deepEqual(config.vectorize, [
    {binding: 'VECTORIZE', index_name: VECTOR_BINDINGS.VECTORIZE},
    {binding: 'VECTORIZE_V2', index_name: VECTOR_BINDINGS.VECTORIZE_V2},
  ], 'must target both distinct QA-only Vectorize indices');
  assert.deepEqual(config.ai, {binding: 'AI'});
  assert.ok(config.vars && typeof config.vars === 'object' && !Array.isArray(config.vars));
  for (const key of Object.keys(config.vars)) {
    assert.ok(ALLOWED_VARS.has(key), `unreviewed QA var: ${key}`);
  }
  assert.equal(config.vars.INGESTION_STAGED_PUBLICATION, 'true');
  assert.equal(config.vars.INGESTION_LEASE_PREFLIGHT, 'true');
  assert.equal(config.vars.GEMINI_MAX_CALLS_PER_INGEST_REQUEST, '3');
  if (mode === 'deployed') {
    assert.equal(config.workers_dev, true);
    assert.equal(config.vars.AUTH_REQUIRED, 'false');
    assert.equal(config.vars.INGESTION_COMPLETE_PUBLICATION, 'true');
    assert.equal(config.vars.QA_EXACT_EVIDENCE_LOOKUP, 'true');
  } else {
    assert.equal(config.vars.INGESTION_COMPLETE_PUBLICATION, 'false');
  }
  return true;
}

export function assertBothQaConfigs(root = ROOT) {
  for (const [filename, mode] of [
    ['wrangler.qa-app.json', 'local'],
    ['wrangler.qa-app-deployed.json', 'deployed'],
  ]) {
    const config = JSON.parse(readFileSync(resolve(root, filename), 'utf8'));
    assertIsolatedQaConfig(config, mode);
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertBothQaConfigs();
  console.log('PASS: exact isolated QA Worker, D1 and dual Vectorize configs; no remote calls');
}
