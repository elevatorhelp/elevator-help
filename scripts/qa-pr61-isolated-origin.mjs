/** Keep QA ingestion bearer tokens inside the exact owner-approved isolated Worker. */
export const PR61_ISOLATED_QA_ORIGIN = 'https://elevator-help-pr61-app-qa.baharmand.workers.dev';

export function requirePr61IsolatedQaOrigin(input) {
  if (typeof input !== 'string' || !input) throw Error('QA_ISOLATED_ORIGIN_REQUIRED');
  let target;
  try { target = new URL(input); }
  catch { throw Error('QA_ISOLATED_ORIGIN_REQUIRED'); }
  // Reject credentials, lookalike hosts, ports, paths, query strings and fragments.
  if (target.origin !== PR61_ISOLATED_QA_ORIGIN ||
      target.href !== PR61_ISOLATED_QA_ORIGIN + '/')
    throw Error('QA_ISOLATED_ORIGIN_REQUIRED');
  return target;
}

/** The actual-app smoke harness must send its disposable bearer to loopback only. */
export const PR61_LOOPBACK_QA_ORIGIN = 'http://127.0.0.1:8787';

export function requirePr61LoopbackQaOrigin(input) {
  if (typeof input !== 'string' || !input) throw Error('QA_LOOPBACK_ORIGIN_REQUIRED');
  let target;
  try { target = new URL(input); }
  catch { throw Error('QA_LOOPBACK_ORIGIN_REQUIRED'); }
  if (target.origin !== PR61_LOOPBACK_QA_ORIGIN ||
      target.href !== PR61_LOOPBACK_QA_ORIGIN + '/')
    throw Error('QA_LOOPBACK_ORIGIN_REQUIRED');
  return target;
}
