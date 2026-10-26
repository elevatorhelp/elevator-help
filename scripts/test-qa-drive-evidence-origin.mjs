import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PR61_ISOLATED_QA_ORIGIN, requirePr61IsolatedQaOrigin, PR61_LOOPBACK_QA_ORIGIN, requirePr61LoopbackQaOrigin} from './qa-pr61-isolated-origin.mjs';

for (const valid of [PR61_ISOLATED_QA_ORIGIN, PR61_ISOLATED_QA_ORIGIN+'/']) {
  assert.equal(requirePr61IsolatedQaOrigin(valid).origin, PR61_ISOLATED_QA_ORIGIN);
}
for (const unsafe of [
  undefined, '', 'not-a-url', 'http://elevator-help-pr61-app-qa.baharmand.workers.dev',
  'https://elevator-help-pr61-app-qa.baharmand.workers.dev.attacker.example',
  'https://attacker.example', PR61_ISOLATED_QA_ORIGIN+':8443',
  PR61_ISOLATED_QA_ORIGIN+'/api/ask', PR61_ISOLATED_QA_ORIGIN+'/?redirect=evil',
  PR61_ISOLATED_QA_ORIGIN+'/#fragment',
  'https://user:pass@elevator-help-pr61-app-qa.baharmand.workers.dev',
]) {
  assert.throws(()=>requirePr61IsolatedQaOrigin(unsafe), /QA_ISOLATED_ORIGIN_REQUIRED/);
}
// Static wiring check: the live test is opt-in and must not require credentials
// or network calls just to exercise this regression.
const source=readFileSync(new URL('./qa-drive-evidence-readback.mjs',import.meta.url),'utf8');
const guard='requirePr61IsolatedQaOrigin(process.env.QA_APP_BASE_URL)';
assert.ok(source.includes(guard),'real readback script must call origin guard');
assert.ok(source.indexOf(guard)<source.indexOf('execFileSync('),
  'origin validation must happen before remote D1 access');
assert.ok(source.includes('new URL("/api/qa-evidence-lookup",qaOrigin)'),
  'request must target a fixed absolute path on the validated origin');
assert.ok(source.includes('redirect:"manual"'),'bearer request must never follow redirects');
assert.ok(source.includes('AbortSignal.timeout(30000)'),'bearer request must be time bounded');
assert.ok(source.includes('"Authorization":"Bearer "+qaToken'),
  'only validated isolated endpoint receives QA bearer');

for (const valid of [PR61_LOOPBACK_QA_ORIGIN, PR61_LOOPBACK_QA_ORIGIN+'/']) {
  assert.equal(requirePr61LoopbackQaOrigin(valid).origin, PR61_LOOPBACK_QA_ORIGIN);
}
for (const unsafe of [
  undefined, '', 'not-a-url', 'https://127.0.0.1:8787',
  'http://localhost:8787', 'http://127.0.0.1:8788',
  'http://127.0.0.1:8787.attacker.example', 'http://attacker.example:8787',
  PR61_LOOPBACK_QA_ORIGIN+'/api/ask', PR61_LOOPBACK_QA_ORIGIN+'/?next=evil',
  PR61_LOOPBACK_QA_ORIGIN+'/#fragment', 'http://user:pass@127.0.0.1:8787',
]) {
  assert.throws(()=>requirePr61LoopbackQaOrigin(unsafe), /QA_LOOPBACK_ORIGIN_REQUIRED/);
}
const fullApp=readFileSync(new URL('./qa-pr61-full-app-e2e.mjs',import.meta.url),'utf8');
assert.ok(fullApp.includes('requirePr61IsolatedQaOrigin(process.env.QA_APP_BASE_URL)'),
  'full-app QA must validate the approved isolated origin before sending its bearer');
assert.ok(fullApp.includes('new URL(path,qaOrigin)'),
  'full-app QA must construct fixed absolute API paths on the validated origin');
assert.ok(fullApp.includes('redirect:"manual"'),
  'full-app QA must not forward its bearer across redirects');
assert.ok(fullApp.includes('AbortSignal.timeout(120000)'),
  'full-app QA must bound remote bearer requests');
const realApp=readFileSync(new URL('./qa-pr61-real-app-e2e.mjs',import.meta.url),'utf8');
assert.ok(realApp.includes('requirePr61LoopbackQaOrigin(process.env.QA_APP_BASE_URL||PR61_LOOPBACK_QA_ORIGIN)'),
  'actual-app QA must refuse remote or non-loopback bearer destinations');
assert.ok(realApp.includes('new URL("/api/drive-ingest-batch",requirePr61LoopbackQaOrigin('),
  'actual-app QA must use a fixed ingestion endpoint');
assert.ok(realApp.includes('redirect:"manual"'),
  'actual-app QA must never forward its bearer across redirects');
assert.ok(realApp.includes('AbortSignal.timeout(120000)'),
  'actual-app QA must bound bearer requests');
console.log('PASS: PR61 isolated/loopback QA bearers pinned; redirects and lookalikes rejected (offline)');
