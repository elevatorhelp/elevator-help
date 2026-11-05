// QA-only, no-write auth probe: verify BOTH outer Worker and inner API gates.
// Sends a deliberately unknown action that the real ingestion route rejects
// with HTTP 400 before any D1/Gemini/Vectorize side effect. Never logs secrets.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requirePr61IsolatedQaOrigin} from './qa-pr61-isolated-origin.mjs';

export const QA_AUTH_ATTEMPTS = 10;
export const QA_AUTH_RETRY_MS = 3000;

export async function verifyDeployedQaAuth({
  origin,
  token,
  fetchImpl = fetch,
  sleep = (ms) => new Promise(r => setTimeout(r,ms)),
}={}) {
  const url=requirePr61IsolatedQaOrigin(origin);
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))
    throw Error('QA_DEPLOYED_AUTH_TOKEN_INVALID');
  for(let attempt=1;attempt<=QA_AUTH_ATTEMPTS;attempt++){
    let response;
    try{
      response=await fetchImpl(new URL('/api/drive-ingest-batch',url),{
        method:'POST',
        headers:{'content-type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({action:'qa_auth_preflight_invalid_action'}),
        redirect:'error',
        signal:AbortSignal.timeout(15000),
      });
    }catch{
      throw Error('QA_DEPLOYED_AUTH_NETWORK_ERROR');
    }
    if(response.status===400){
      let data;
      try{data=await response.json()}catch{throw Error('QA_DEPLOYED_AUTH_INVALID_400');}
      if(data?.ok===false && data?.error==='INVALID_INGEST_ACTION')
        return 'QA_DEPLOYED_AUTH_READY';
      throw Error('QA_DEPLOYED_AUTH_INVALID_400');
    }
    // Cloudflare edge propagation may transiently route to an earlier QA
    // version. Retry only auth denials, never arbitrary application errors.
    if(response.status!==401 && response.status!==403)
      throw Error('QA_DEPLOYED_AUTH_UNEXPECTED_HTTP_'+
        (Number.isInteger(response.status)?response.status:'UNKNOWN'));
    if(attempt<QA_AUTH_ATTEMPTS)await sleep(QA_AUTH_RETRY_MS);
  }
  throw Error('QA_DEPLOYED_AUTH_NOT_READY');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=await verifyDeployedQaAuth({
      origin:process.env.QA_APP_BASE_URL,
      token:process.env.QA_INGESTION_TOKEN,
    });
    console.log('PASS: '+result);
  }catch(error){
    const s=error instanceof Error?error.message:'';
    const safe=/^QA_DEPLOYED_AUTH_(?:TOKEN_INVALID|INVALID_400|NETWORK_ERROR|NOT_READY|UNEXPECTED_HTTP_(?:[1-5]\d\d|UNKNOWN))$/.test(s)
      ?s:'QA_DEPLOYED_AUTH_UNKNOWN_FAILURE';
    console.error('::error::'+safe);
    process.exitCode=1;
  }
}
