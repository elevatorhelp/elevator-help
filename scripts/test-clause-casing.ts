import assert from 'node:assert/strict';
import { extractClauseNumbers } from '../app/lib/standard-identifiers.ts';
assert.deepEqual(extractClauseNumbers('See a.1'), ['A.1']);
assert.deepEqual(extractClauseNumbers('A.1 and a.1'), ['A.1']);
assert.deepEqual(extractClauseNumbers('Error E14; ratio 4:1; model DRIVE-X35/50'), []);
console.log('PASS: normalized references');
