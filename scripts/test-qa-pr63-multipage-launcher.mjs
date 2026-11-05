import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../.github/workflows/qa-pr61-actual-app.yml',import.meta.url),'utf8');
const child=readFileSync(new URL('../.github/workflows/qa-pr61-multipage.yml',import.meta.url),'utf8');
const entryHeader=entry.slice(0,entry.indexOf('permissions:'));
const childHeader=child.slice(0,child.indexOf('permissions:'));
for(const [label,header] of [['launcher',entryHeader],['multipage child',childHeader]]) {
 assert.ok(header.includes('  workflow_dispatch:'),label+' must allow explicit manual dispatch');
 for(const invalid of ['  push:','  schedule:','  pull_request:','  workflow_run:','  repository_dispatch:'])
  assert.ok(!header.includes(invalid),label+' cannot auto-trigger paid QA');
}
assert.ok(entryHeader.includes('run_multipage_drive_qa:'),'missing explicit manual multipage selection');
const inputs=entryHeader.split('run_multipage_drive_qa:')[1];
assert.ok(inputs.includes('required: true')&&inputs.includes('default: false'),
 'paid multipage must default OFF and require manual consent');
const jobStart=entry.indexOf('\n  multipage-drive-qa:');
assert.ok(jobStart>0,'missing manual multipage reusable job');
const call=entry.slice(jobStart);
for(const required of [
 'inputs.run_multipage_drive_qa == true',
 'inputs.allow_paid_gemini == true',
 'inputs.allow_isolated_d1_mutation == true',
 'inputs.run_disposable_d1_restore == false',
 'inputs.create_missing_qa_vectorize == false',
 'uses: ./.github/workflows/qa-pr61-multipage.yml',
 'allow_paid_qa: true',
 'secrets: inherit',
]) assert.ok(call.includes(required),'missing multipage isolation: '+required);
const actual=entry.slice(entry.indexOf('  actual-app:'),entry.indexOf('  disposable-d1-restore:'));
assert.ok(actual.includes('inputs.run_multipage_drive_qa == false'),
 'multipage QA must disable the normal actual-app job');
const restore=entry.slice(entry.indexOf('  disposable-d1-restore:'),jobStart);
assert.ok(restore.includes('inputs.run_multipage_drive_qa == false'),
 'multipage QA must disable the disposable D1 restore job');
assert.ok(childHeader.includes('  workflow_call:'),'multipage must be callable at same PR SHA');
assert.ok(childHeader.includes('allow_paid_qa:')&&childHeader.includes('required: true'),
 'called workflow also needs positive paid approval');
assert.ok(child.includes("github.event_name == 'workflow_dispatch' && inputs.allow_paid_qa == true"),
 'called workflow must fail closed without explicit manual caller input');
assert.ok(entry.includes('  group: qa-pr61-isolated-d1-mutating'),
 'parent serialized lock protects all shared QA resources');
assert.ok(child.includes("github.workflow == 'PR61 actual application isolated E2E'"),
 'reusable QA child must recognize its already-serialized parent');
assert.ok(child.includes("format('qa-pr61-multipage-nested-{0}', github.run_id)"),
 'nested workflow must use a separate concurrency group to avoid deadlock');
assert.ok(child.includes("|| 'qa-pr61-isolated-d1-mutating'"),
 'direct-dispatch mode must retain shared Cloudflare QA lock');
const secret=child.indexOf('      - name: Verify Cloudflare secret presence without reading values');
const db=child.indexOf('      - name: Create QA-only D1 tables');
const deploy=child.indexOf('      - name: Deploy protected QA Worker');
assert.ok(secret>0&&secret<db&&secret<deploy,
 'Gemini secret presence must be proven before any paid build/Cloudflare mutation');
assert.ok(child.includes('MAX_GEMINI_CALLS: "24"'),
 'real Drive QA must retain reviewed per-process call limit');
assert.ok(child.includes('MAX_FILES: "1"')&&child.includes('TARGET_FILE_ID:'),
 'Drive ingestion must be scoped to one fixed QA document');
assert.ok(child.includes('QA_INTERRUPT_AFTER_FIRST_RAW_BATCH=true'),
 'must inject real durable checkpoint interruption');
assert.ok(child.includes('QA resumed verified same-generation durable checkpoint')===false,
 'the test must invoke the actual ingestion script, not spoof a success log');
assert.ok(child.includes('node scripts/drive-ingest.mjs'),
 'must actually resume Drive ingestion');
assert.ok(child.includes('node scripts/qa-drive-evidence-readback.mjs'),
 'must verify source evidence and citations after recovery');
assert.ok(child.includes('node scripts/qa-drive-recovery-live.mjs'),
 'must independently prove stale-owner/failed-publication recovery');
for(const forbidden of ['elevator-help-cortex','elevator-help-multilingual-v2','elevator-help-index'])
 assert.ok(!child.includes(forbidden),'no production resource target in multipage QA');
console.log('PASS: bounded multipage Drive QA routed only through mutually exclusive manual approval, no parent/child concurrency deadlock or production targets');
