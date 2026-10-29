import {readFileSync} from 'node:fs';

const qaName = /^qa-pr61-restore-[1-9]\d{0,19}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function rows(value) {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || typeof row.name !== 'string')) {
    throw Error('QA_D1_LIST_INVALID');
  }
  if (new Set(value.map(row => row.name)).size !== value.length) throw Error('QA_D1_LIST_AMBIGUOUS');
  return value;
}
function requireName(name) {
  if (typeof name !== 'string' || !qaName.test(name)) throw Error('QA_D1_NAME_INVALID');
}
function requireUuid(id) {
  if (typeof id !== 'string' || !uuid.test(id)) throw Error('QA_D1_UUID_INVALID');
}

// Claim ownership only after a successful create and a fresh readback. A
// failed/ambiguous create must NEVER authorize deletion by name: another
// actor could have created that name between the preflight and create call.
export function claimNewQaD1(before, after, name) {
  requireName(name);
  const prior = rows(before), current = rows(after);
  if (prior.some(row => row.name === name)) throw Error('QA_D1_ALREADY_EXISTED');
  const found = current.filter(row => row.name === name);
  if (found.length !== 1) throw Error('QA_D1_CREATED_ID_UNVERIFIED');
  const id = found[0].uuid;
  requireUuid(id);
  if (prior.some(row => row.uuid === id)) throw Error('QA_D1_UUID_NOT_NEW');
  return id;
}

// Cleanup is authorized by the immutable database UUID, not a reusable name.
export function requireOwnedQaD1(current, name, id) {
  requireName(name);
  requireUuid(id);
  const found = rows(current).filter(row => row.name === name);
  if (found.length !== 1 || found[0].uuid !== id) throw Error('QA_D1_CLEANUP_OWNERSHIP_MISMATCH');
  return id;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const [action, name, arg1, arg2] = process.argv.slice(2);
  if (action === 'claim' && arg1 && arg2) {
    console.log(claimNewQaD1(JSON.parse(readFileSync(arg1, 'utf8')),
      JSON.parse(readFileSync(arg2, 'utf8')), name));
  } else if (action === 'verify' && arg1 && arg2) {
    console.log(requireOwnedQaD1(JSON.parse(readFileSync(arg2, 'utf8')), name, arg1));
  } else {
    throw Error('QA_D1_OWNERSHIP_USAGE');
  }
}
