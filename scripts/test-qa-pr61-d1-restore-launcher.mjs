import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const entry=readFileSync(new URL('../.github/workflows/qa-pr61-actual-app.yml',import.meta.url),'utf8');
const restore=readFileSync(new URL('../.github/workflows/qa-pr61-d1-restore.yml',import.meta.url),'utf8');
const manualOnly=entry.slice(0,entry.indexOf('permissions:'));
assert.ok(manualOnly.includes('  workflow_dispatch:'),'QA entry must require manual dispatch');
for(const forbidden of ['  push:','  pull_request:','  schedule:','  workflow_run:'])
 assert.ok(!manualOnly.includes(forbidden),'QA entry must not run automatically');
assert.ok(manualOnly.includes('run_disposable_d1_restore:'));
const input=manualOnly.split('run_disposable_d1_restore:')[1];
assert.ok(input.includes('required: true')&&input.includes('default: false'));
assert.ok(entry.includes("inputs.allow_isolated_d1_mutation == true && inputs.run_disposable_d1_restore == false"),
 'normal actual-app must not run during D1 restore');
const call=entry.slice(entry.indexOf('  disposable-d1-restore:'));
for(const required of [
 'inputs.run_disposable_d1_restore == true',
 'inputs.allow_isolated_d1_mutation == false',
 'inputs.allow_paid_gemini == false',
 'inputs.create_missing_qa_vectorize == false',
 'inputs.run_multipage_drive_qa == false',
 'uses: ./.github/workflows/qa-pr61-d1-restore.yml',
 'allow_remote_d1_qa: true',
 'secrets: inherit',
]) assert.ok(call.includes(required),'Restore launcher missing explicit isolation: '+required);
const child=restore.slice(0,restore.indexOf('permissions:'));
assert.ok(child.includes('  workflow_call:'),'callee must support workflow_call');
assert.ok(child.includes('  workflow_dispatch:'),'callee should preserve standalone opt-in');
assert.ok(child.includes('allow_remote_d1_qa:')&&child.includes('required: true'));
assert.ok(restore.includes("inputs.allow_remote_d1_qa == true"),'callee must fail closed too');
for(const required of [
 'QA_DB: qa-pr61-restore-',
 'npx wrangler d1 time-travel restore',
 'qa-pr61-d1-ownership.mjs verify',
 'd1/database/$QA_CREATED_DB_ID',
]) assert.ok(restore.includes(required),'Disposal safety required: '+required);
for(const forbidden of ['elevator-help-cortex','elevator-help-index','elevator-help-multilingual-v2'])
 assert.ok(!restore.includes(forbidden),'No Production resources allowed');
console.log('PASS: same-commit reusable D1 restore launches only via explicit exclusive QA choice; no production targets');
