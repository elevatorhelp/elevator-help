import assert from 'node:assert/strict';
import { extractClauseNumbers } from '../app/lib/standard-identifiers.ts';

assert.deepEqual(extractClauseNumbers('See D.7, A.1.2 and ZA.2'), ['D.7','A.1.2','ZA.2']);
assert.deepEqual(extractClauseNumbers('See 5.4.2 and 6.3.1'), ['5.4.2','6.3.1']);
assert.deepEqual(extractClauseNumbers('Clause D.7; again D.7'), ['D.7']);
console.log('PASS: numeric and lettered annex clauses');
