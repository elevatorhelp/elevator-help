import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PR61_ISOLATED_QA_ORIGIN, requirePr61IsolatedQaOrigin} from './qa-pr61-isolated-origin.mjs';

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
console.log('PASS: PR61 evidence QA bearer pinned to isolated origin; redirects and lookalikes rejected (offline)');
