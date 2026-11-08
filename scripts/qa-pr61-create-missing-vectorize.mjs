// One-time, explicitly approved QA-only Cloudflare Vectorize index provisioner.
// Hard-coded index targets; never prints response bodies, tokens, URLs or archive data.
// No main/Production index, vector upsert, deletion or binding modification.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const QA_INDEX = Object.freeze({
  name: 'elevator-help-staging-test-v2',
  dimensions: 768,
  metric: 'cosine',
});
export const QA_LEGACY_INDEX = Object.freeze({
  name: 'elevator-help-staging-test',
  dimensions: 768,
  metric: 'cosine',
});

export function hasExactIndexConfiguration(payload, expected) {
  const item = payload?.result ?? payload;
  const config = item?.config;
  return item?.name === expected.name &&
    config?.dimensions === expected.dimensions &&
    config?.metric === expected.metric;
}

export function approvedQaIndexCreationRequest() {
  return {
    name: QA_INDEX.name,
    description: 'Isolated multilingual QA index for elevator-help PR63',
    config: {dimensions: QA_INDEX.dimensions, metric: QA_INDEX.metric},
  };
}

function codeError(label, status) {
  // Status is numeric HTTP metadata only; no untrusted error payload is logged.
  const value = Number.isInteger(status) && status >= 100 && status <= 599
    ? String(status)
    : 'UNKNOWN';
  throw new Error(label + '_' + value);
}

async function readIndex(fetchImpl, url, authHeader) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {Authorization:authHeader, Accept:'application/json'},
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (response.status !== 200) return {status:response.status, body:null};
  let body;
  try { body = await response.json(); } catch { throw new Error('QA_INDEX_METADATA_INVALID_JSON'); }
  return {status:response.status,body};
}

export async function provisionQaMultilingualIndex({
  fetchImpl = fetch, accountId, token, pause = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  if (!/^[a-f0-9]{32}$/i.test(accountId || '') || !token || typeof token !== 'string')
    throw new Error('QA_CLOUDFLARE_CREDENTIALS_INVALID');
  const base = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/vectorize/v2/indexes';
  const auth = 'Bearer ' + token;
  // First verify that the account and token can already see the known QA index.
  const legacy = await readIndex(fetchImpl, base + '/' + QA_LEGACY_INDEX.name, auth);
  if (legacy.status !== 200) codeError('QA_LEGACY_INDEX_LOOKUP_HTTP',legacy.status);
  if (!hasExactIndexConfiguration(legacy.body,QA_LEGACY_INDEX))
    throw new Error('QA_LEGACY_INDEX_CONFIG_MISMATCH');

  const current = await readIndex(fetchImpl,base + '/' + QA_INDEX.name,auth);
  if (current.status === 200) {
    if (!hasExactIndexConfiguration(current.body,QA_INDEX))
      throw new Error('QA_MULTILINGUAL_INDEX_CONFIG_MISMATCH');
    return 'QA_MULTILINGUAL_INDEX_ALREADY_VERIFIED';
  }
  if (current.status !== 404) codeError('QA_MULTILINGUAL_INDEX_LOOKUP_HTTP',current.status);

  // Single fixed-name creation, only after 404 in the approved Cloudflare account.
  const created = await fetchImpl(base,{
    method:'POST',
    headers:{Authorization:auth,Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify(approvedQaIndexCreationRequest()),
    redirect:'error',
    signal:AbortSignal.timeout(20000),
  });
  if (created.status !== 201 && created.status !== 200)
    codeError('QA_MULTILINGUAL_CREATE_HTTP',created.status);

  // Cloudflare index availability can be briefly eventually consistent.
  for (let i=0;i<5;i++) {
    const check=await readIndex(fetchImpl,base + '/' + QA_INDEX.name,auth);
    if (check.status === 200) {
      if (!hasExactIndexConfiguration(check.body,QA_INDEX))
        throw new Error('QA_MULTILINGUAL_CREATED_CONFIG_MISMATCH');
      return 'QA_MULTILINGUAL_INDEX_CREATED_VERIFIED';
    }
    if (check.status !== 404) codeError('QA_MULTILINGUAL_READBACK_HTTP',check.status);
    if(i<4) await pause(1000);
  }
  throw new Error('QA_MULTILINGUAL_CREATED_READBACK_PENDING');
}

async function main(){
  try {
    const result=await provisionQaMultilingualIndex({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      token:process.env.CLOUDFLARE_API_TOKEN,
    });
    console.log('PASS: '+result);
  } catch (error) {
    const message=error instanceof Error ? error.message : '';
    // This exact allowlist prevents exceptions, token-containing URLs and API
    // response text from ever appearing in durable GitHub Actions logs.
    const allowed=[
      /^QA_CLOUDFLARE_CREDENTIALS_INVALID$/,
      /^QA_LEGACY_INDEX_LOOKUP_HTTP_(?:[1-5]\d\d|UNKNOWN)$/,
      /^QA_LEGACY_INDEX_CONFIG_MISMATCH$/,
      /^QA_INDEX_METADATA_INVALID_JSON$/,
      /^QA_MULTILINGUAL_INDEX_CONFIG_MISMATCH$/,
      /^QA_MULTILINGUAL_INDEX_LOOKUP_HTTP_(?:[1-5]\d\d|UNKNOWN)$/,
      /^QA_MULTILINGUAL_CREATE_HTTP_(?:[1-5]\d\d|UNKNOWN)$/,
      /^QA_MULTILINGUAL_CREATED_CONFIG_MISMATCH$/,
      /^QA_MULTILINGUAL_READBACK_HTTP_(?:[1-5]\d\d|UNKNOWN)$/,
      /^QA_MULTILINGUAL_CREATED_READBACK_PENDING$/,
    ];
    const safe=allowed.some(pattern=>pattern.test(message)) ? message : 'QA_INDEX_UNCLASSIFIED_ERROR';
    console.error('::error::'+safe);
    process.exitCode=1;
  }
}
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))await main();
