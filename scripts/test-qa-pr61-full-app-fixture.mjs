import assert from 'node:assert/strict';
import test from 'node:test';
import {buildQaFullAppMultipageFixture,hasQaFullAppMapPageCoverage} from './qa-pr61-full-app-fixture.mjs';

test('isolated complete-publication QA stages RAW, Evidence and Map inputs from two distinct physical pages',()=>{
  const doc='qa61-complete-123',revision='revision-123';
  const {chunks,evidence,pages,rawIds,evidenceIds}=buildQaFullAppMultipageFixture(doc,revision);
  assert.deepEqual(chunks.map(c=>c.page),[1,2]);
  assert.deepEqual(evidence.map(c=>c.page),[1,2]);
  assert.deepEqual(pages.map(p=>p.page),[1,2]);
  assert.deepEqual(rawIds,[doc+':r1',doc+':r2']);
  assert.deepEqual(evidenceIds,[doc+':e1',doc+':e2']);
  assert.deepEqual(evidence.map(c=>c.text),chunks.map(c=>c.text));
  for(const chunk of [...chunks,...evidence]){
    assert.equal(chunk.sourceFileId,doc);
    assert.equal(chunk.sourceFingerprint,revision);
    assert.equal(chunk.fileName,'qa.txt');
  }
  assert.ok(pages.every(p=>p.text.length>20));
});

test('isolated fixture rejects empty document identity or revision',()=>{
  assert.throws(()=>buildQaFullAppMultipageFixture('', 'rev'),/QA_FULL_APP_FIXTURE_ID_REQUIRED/);
  assert.throws(()=>buildQaFullAppMultipageFixture('doc', ''),/QA_FULL_APP_FIXTURE_ID_REQUIRED/);
});

test('map coverage must include both supplied physical pages',()=>{
  const pages=buildQaFullAppMultipageFixture('doc','rev').pages;
  assert.equal(hasQaFullAppMapPageCoverage([{pageStart:1,pageEnd:1},{pageStart:2,pageEnd:2}],pages),true);
  assert.equal(hasQaFullAppMapPageCoverage([{pageStart:1,pageEnd:2}],pages),true);
  assert.equal(hasQaFullAppMapPageCoverage([{pageStart:1,pageEnd:1}],pages),false);
  assert.equal(hasQaFullAppMapPageCoverage([{pageStart:2,pageEnd:2}],pages),false);
  assert.equal(hasQaFullAppMapPageCoverage([{pageStart:1,pageEnd:3}],pages),false);
  assert.equal(hasQaFullAppMapPageCoverage([{pageStart:'1',pageEnd:'2'}],pages),false);
  assert.equal(hasQaFullAppMapPageCoverage([],pages),false);
});
