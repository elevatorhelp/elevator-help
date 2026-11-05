// Read-only QA diagnostic: never list/read vector records or print Wrangler output.
// This script is manually dispatched by the existing QA workflow, not on CI builds.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const EXPECTED = Object.freeze([
  Object.freeze({binding:'VECTORIZE',index_name:'elevator-help-staging-test',tag:'LEGACY'}),
  Object.freeze({binding:'VECTORIZE_V2',index_name:'elevator-help-staging-test-v2',tag:'MULTILINGUAL'}),
]);

export function approvedQaVectorizeTargets(config) {
  if (config?.name !== 'elevator-help-pr61-app-qa' ||
      !Array.isArray(config?.vectorize) || config.vectorize.length !== EXPECTED.length ||
      config.vectorize.some((item,i) => item?.binding !== EXPECTED[i].binding ||
                                             item?.index_name !== EXPECTED[i].index_name)) {
    throw new Error('QA_VECTORIZE_CONFIG_NOT_APPROVED');
  }
  return EXPECTED;
}

export function safeQaIndexLookupResult(tag, status) {
  // A successful CLI metadata fetch confirms read permission and index lookup.
  // A failed lookup does NOT distinguish absence from missing API permissions.
  if (!['LEGACY','MULTILINGUAL'].includes(tag)) throw new Error('QA_VECTORIZE_INVALID_TAG');
  return status === 0 ? 'QA_VECTORIZE_' + tag + '_METADATA_OK'
                      : 'QA_VECTORIZE_' + tag + '_LOOKUP_FAILED';
}

function main() {
  let plan;
  try {
    const config = JSON.parse(readFileSync('wrangler.qa-app.json','utf8'));
    plan = approvedQaVectorizeTargets(config);
  } catch {
    console.error('::error::QA_VECTORIZE_CONFIG_NOT_APPROVED');
    process.exitCode = 1;
    return;
  }
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    console.error('::error::QA_VECTORIZE_CREDENTIALS_UNAVAILABLE');
    process.exitCode = 1;
    return;
  }
  let failed = false;
  for (const item of plan) {
    // Only metadata reads. Never print captured stdout/stderr: it may include URLs
    // and auth-error details. Never use a shell or pass secrets on command line.
    const run = spawnSync('./node_modules/.bin/wrangler',
      ['vectorize','get',item.index_name,'--json','--config','wrangler.qa-app.json'], {
        encoding:'utf8',timeout:45000,maxBuffer:1024*1024,
        env:process.env,stdio:['ignore','pipe','pipe'],
        windowsHide:true,
      });
    const status = !run.error && !run.signal && run.status === 0 ? 0 : 1;
    const category = safeQaIndexLookupResult(item.tag,status);
    if (status !== 0) { console.error('::error::'+category); failed = true; }
    else console.log('PASS: '+category);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
