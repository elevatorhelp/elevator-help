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
export function assertIsolatedQaConfig(config, mode) {
  assert.ok(mode === 'deployed' || mode === 'local', 'unknown QA config mode');
  assert.ok(config && typeof config === 'object' && !Array.isArray(config));
  for (const key of Object.keys(config)) {
    assert.ok(ALLOWED_KEYS.has(key), `unreviewed Wrangler setting: ${key}`);
  }
  // A top-level allowlist is insufficient: a permitted nested object can still
  // silently change runtime capabilities, rate limits or QA-only behavior.
  assert.equal(config.$schema, './node_modules/wrangler/config-schema.json');
  assert.equal(config.compatibility_date, '2026-08-23');
  assert.deepEqual(config.compatibility_flags, ['nodejs_compat']);
  assert.deepEqual(config.assets, {
    directory: '.open-next/assets', binding: 'ASSETS',
  });
  assert.deepEqual(config.observability, {enabled: mode === 'local'});
  assert.deepEqual(config.ratelimits, [{
    name: 'GEMINI_ASK_RATE_LIMITER', namespace_id: '24001',
    simple: {limit: 30, period: 60},
  }]);
  assert.equal(config.name, 'elevator-help-pr61-app-qa');
  assert.equal(config.main, mode === 'deployed'
    ? 'workers/qa-real-app-entry.mjs' : '.open-next/worker.js');
  assert.deepEqual(config.d1_databases, [{
    binding: 'CORTEX_DB', database_name: 'elevator-help-lease-test-01', database_id: D1_ID,
  }], 'must target only approved disposable QA D1');
  assert.deepEqual(config.vectorize, [
    {binding: 'VECTORIZE', index_name: VECTOR_BINDINGS.VECTORIZE},
    {binding: 'VECTORIZE_V2', index_name: VECTOR_BINDINGS.VECTORIZE_V2},
  ], 'must target both distinct QA-only Vectorize indices');
  assert.deepEqual(config.ai, {binding: 'AI'});
  const expectedVars = {
    AUTH_REQUIRED: 'false',
    INGESTION_STAGED_PUBLICATION: 'true',
    INGESTION_LEASE_PREFLIGHT: 'true',
    GEMINI_MAX_CALLS_PER_INGEST_REQUEST: '3',
    INGESTION_COMPLETE_PUBLICATION: mode === 'deployed' ? 'true' : 'false',
    ...(mode === 'deployed' ? {QA_EXACT_EVIDENCE_LOOKUP: 'true'} : {}),
  };
  assert.deepEqual(config.vars, expectedVars,
    'QA vars must match exact reviewed values; no extra toggles');
  if (mode === 'deployed') {
    assert.equal(config.workers_dev, true);
  } else {
    assert.equal(config.workers_dev, undefined,
      'local QA config must not unexpectedly expose a workers.dev endpoint');
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
