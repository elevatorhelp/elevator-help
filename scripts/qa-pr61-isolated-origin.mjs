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
