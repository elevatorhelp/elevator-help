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
]) {
  const mutated = clone(qa); change(mutated);
  assert.throws(()=>assertIsolatedQaConfig(mutated,'deployed'), undefined, name);
}
console.log('PASS: isolated config guard rejects 11 unsafe mutations; no remote calls');
