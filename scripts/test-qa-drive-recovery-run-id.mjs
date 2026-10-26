import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasBoundedFullPublicationManifest} from '../app/lib/ingestion-vector-readback.ts';

// Regression: a double-escaped \\d in a JavaScript regex literal treats
// GitHub's numeric run ID as invalid and prevents any live Drive restart QA.
const source=readFileSync(new URL('./qa-drive-recovery-live.mjs',import.meta.url),'utf8');
const m=source.match(/if\(!\/([^\n]+?)\/\.test\(runId\|\|""\)\|\|!\/([^\n]+?)\/\.test\(attempt\)\)/);
assert.ok(m,'QA run/attempt validation must remain present and fail closed');
const run=new RegExp(m[1]);
const attempt=new RegExp(m[2]);
for(const id of ['1','42','12345678901234567890']) assert.ok(run.test(id),'valid numeric run ID: '+id);
for(const id of ['','0','01','abc','1d','1\\d','123456789012345678901']) assert.ok(!run.test(id),'invalid run ID: '+id);
for(const id of ['1','42','123456']) assert.ok(attempt.test(id),'valid attempt: '+id);
for(const id of ['','0','01','1d','1234567']) assert.ok(!attempt.test(id),'invalid attempt: '+id);
assert.ok(source.includes('QA_ISOLATED_ORIGIN_REQUIRED'),'must preserve isolated-origin guard');
assert.ok(source.includes('redirect:"manual"'),'must preserve no-redirect bearer guard');
// Regression: an empty Map manifest is rejected with HTTP 400 before the
// intended stale-owner/partial-publication HTTP 409 checks can run.
const validManifest='rawIds:[chunk.id],evidenceIds:[chunk.id],mapIds:[id+":map1"]';
assert.equal(source.split(validManifest).length-1,2,
  'both pre- and post-takeover publication probes need a valid three-layer manifest');
assert.equal(hasBoundedFullPublicationManifest(['qa:c1'],['qa:c1'],[],'revision-a'),false,
  'an empty Map manifest cannot exercise the 409 publication path');
assert.equal(hasBoundedFullPublicationManifest(['qa:c1'],['qa:c1'],['qa:map1'],'revision-a'),true,
  'three-layer manifest must pass shape validation before isolated remote checks');
console.log('PASS: real numeric GitHub run IDs accepted; invalid IDs/attempts and three-layer recovery manifests rejected without network or secrets');
