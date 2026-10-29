import assert from 'node:assert/strict';
import test from 'node:test';
import {claimNewQaD1,requireOwnedQaD1} from './qa-pr61-d1-ownership.mjs';

const name='qa-pr61-restore-40913358150';
const id='02716877-15e3-4478-9e24-f1ba6e5dfb00';
const other='a2716877-15e3-4478-9e24-f1ba6e5dfb00';
const before=[{name:'production-d1',uuid:other}];
const after=[...before,{name,uuid:id}];
test('fresh exact-name database UUID is the only cleanup capability',()=>{
  assert.equal(claimNewQaD1(before,after,name),id);
  assert.equal(requireOwnedQaD1(after,name,id),id);
});
test('failed create must not transfer ownership of a raced pre-existing name',()=>{
  assert.throws(()=>claimNewQaD1(before,before,name),/UNVERIFIED/);
  assert.throws(()=>claimNewQaD1(after,after,name),/ALREADY_EXISTED/);
  assert.throws(()=>claimNewQaD1(before,[...after,{name,uuid:other}],name),/AMBIGUOUS/);
  assert.throws(()=>claimNewQaD1([{name:'old',uuid:id}],after,name),/UUID_NOT_NEW/);
  assert.throws(()=>claimNewQaD1(before,[...after,{name:'alias',uuid:id}],name),/AMBIGUOUS/);
  assert.throws(()=>claimNewQaD1([{name:'production-d1'}],after,name),/LIST_INVALID/);
});
test('cleanup rejects replacement by another UUID and malformed identities',()=>{
  assert.throws(()=>requireOwnedQaD1([{name,uuid:other}],name,id),/OWNERSHIP_MISMATCH/);
  assert.throws(()=>requireOwnedQaD1(before,name,id),/OWNERSHIP_MISMATCH/);
  assert.throws(()=>requireOwnedQaD1(after,'production-d1',other),/NAME_INVALID/);
  assert.throws(()=>requireOwnedQaD1(after,name,'../production'),/UUID_INVALID/);
  assert.throws(()=>requireOwnedQaD1([...after,{name:'alias',uuid:id}],name,id),/AMBIGUOUS/);
  assert.throws(()=>requireOwnedQaD1([{name,uuid:id},{name:'unknown'}],name,id),/LIST_INVALID/);
  assert.throws(()=>claimNewQaD1(before,[{name,uuid:'not-uuid'}],name),/UUID_INVALID/);
});
