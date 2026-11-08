import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assertIsolatedQaConfig} from './qa-pr61-assert-isolated-config.mjs';

const qa = JSON.parse(readFileSync(resolve(import.meta.dirname,'..','wrangler.qa-app-deployed.json'),'utf8'));
const local = JSON.parse(readFileSync(resolve(import.meta.dirname,'..','wrangler.qa-app.json'),'utf8'));
assert.equal(assertIsolatedQaConfig(qa,'deployed'),true);
assert.equal(assertIsolatedQaConfig(local,'local'),true);
const clone = x => structuredClone(x);
for (const [name, change] of [
  ['production worker name', x => {x.name='elevator-help';}],
  ['production D1', x => {x.d1_databases[0].database_name='elevator-help';}],
  ['production D1 id', x => {x.d1_databases[0].database_id='bad';}],
  ['production vector index', x => {x.vectorize[1].index_name='elevator-help';}],
  ['aliased vector bindings', x => {x.vectorize[1].index_name=x.vectorize[0].index_name;}],
  ['route', x => {x.routes=['example.com/*'];}],
  ['account id override', x => {x.account_id='production';}],
  ['environment override', x => {x.env={production:{name:'elevator-help'}};}],
  ['unreviewed secret var', x => {x.vars.GEMINI_API_KEY='secret';}],
  ['unbounded Gemini budget', x => {x.vars.GEMINI_MAX_CALLS_PER_INGEST_REQUEST='100';}],
  ['wrong entrypoint', x => {x.main='.open-next/worker.js';}],
  ['unsafe compatibility flag', x => {x.compatibility_flags.push('unsafe_eval');}],
  ['unreviewed compatibility date', x => {x.compatibility_date='2026-10-27';}],
  ['assets runtime override', x => {x.assets.run_worker_first=true;}],
  ['rate limiter disabled', x => {x.ratelimits=[];}],
  ['rate limiter unbounded', x => {x.ratelimits[0].simple.limit=100000;}],
  ['rate limiter namespace swapped', x => {x.ratelimits[0].namespace_id='1';}],
  ['observability logging changed', x => {x.observability.enabled=true;}],
  ['QA auth toggled', x => {x.vars.AUTH_REQUIRED='true';}],
  ['extra allowed QA flag toggled', x => {x.vars.QA_EXACT_EVIDENCE_LOOKUP='false';}],
  ['workers dev disabled', x => {x.workers_dev=false;}],
]) {
  const mutated = clone(qa); change(mutated);
  assert.throws(()=>assertIsolatedQaConfig(mutated,'deployed'), undefined, name);
}
// Also reject a QA-only feature flag accidentally enabled on the local config.
const unsafeLocal=clone(local);
unsafeLocal.vars.QA_EXACT_EVIDENCE_LOOKUP='true';
assert.throws(()=>assertIsolatedQaConfig(unsafeLocal,'local'));
console.log('PASS: isolated config guard rejects 22 unsafe mutations; no remote calls');
