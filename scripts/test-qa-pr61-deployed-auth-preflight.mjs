import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QA_AUTH_ATTEMPTS,QA_AUTH_RETRY_MS,verifyDeployedQaAuth} from './qa-pr61-deployed-auth-preflight.mjs';

const origin='https://elevator-help-pr61-app-qa.baharmand.workers.dev';
const token='a'.repeat(64);
const authOK={status:400,async json(){return {ok:false,error:'INVALID_INGEST_ACTION'};}};
function mock(sequence) {
  const seen=[];
  const fetchImpl=async (url,opts)=>{
    seen.push({url:String(url),method:opts.method,auth:opts.headers.Authorization,body:opts.body,redirect:opts.redirect});
    return sequence[Math.min(seen.length-1,sequence.length-1)];
  };
  return {seen,fetchImpl};
}
const s=async()=>{};
{
 const m=mock([authOK]);
 assert.equal(await verifyDeployedQaAuth({origin,token,fetchImpl:m.fetchImpl,sleep:s}),'QA_DEPLOYED_AUTH_READY');
 assert.equal(m.seen.length,1);
 assert.equal(m.seen[0].url,origin+'/api/drive-ingest-batch');
 assert.equal(m.seen[0].auth,'Bearer '+token);
 assert.equal(m.seen[0].redirect,'error');
 assert.equal(JSON.parse(m.seen[0].body).action,'qa_auth_preflight_invalid_action');
 assert.equal(m.seen[0].method,'POST');
}
{
 const wait=[];
 const m=mock([{status:403},{status:401},authOK]);
 assert.equal(await verifyDeployedQaAuth({origin,token,fetchImpl:m.fetchImpl,sleep:async ms=>wait.push(ms)}),'QA_DEPLOYED_AUTH_READY');
 assert.equal(m.seen.length,3);
 assert.deepEqual(wait,[QA_AUTH_RETRY_MS,QA_AUTH_RETRY_MS]);
}
{
 const m=mock([{status:401}]);
 let sleeps=0;
 await assert.rejects(verifyDeployedQaAuth({origin,token,fetchImpl:m.fetchImpl,sleep:async()=>sleeps++}),
   /QA_DEPLOYED_AUTH_NOT_READY/);
 assert.equal(m.seen.length,QA_AUTH_ATTEMPTS);
 assert.equal(sleeps,QA_AUTH_ATTEMPTS-1);
}
{
 const m=mock([{status:400,async json(){return {ok:false,error:'Unauthorized'};}}]);
 await assert.rejects(verifyDeployedQaAuth({origin,token,fetchImpl:m.fetchImpl,sleep:s}),
   /QA_DEPLOYED_AUTH_INVALID_400/);
 assert.equal(m.seen.length,1);
}
{
 const m=mock([{status:500}]);
 await assert.rejects(verifyDeployedQaAuth({origin,token,fetchImpl:m.fetchImpl,sleep:s}),
   /QA_DEPLOYED_AUTH_UNEXPECTED_HTTP_500/);
 assert.equal(m.seen.length,1);
}
{
 const m=mock([authOK]);
 await assert.rejects(verifyDeployedQaAuth({origin:'https://elevator.help',token,fetchImpl:m.fetchImpl,sleep:s}),
   /QA_ISOLATED_ORIGIN_REQUIRED/);
 assert.equal(m.seen.length,0);
 await assert.rejects(verifyDeployedQaAuth({origin,token:'invalid',fetchImpl:m.fetchImpl,sleep:s}),
   /QA_DEPLOYED_AUTH_TOKEN_INVALID/);
 assert.equal(m.seen.length,0);
}
const wf=readFileSync(new URL('../.github/workflows/qa-pr61-multipage.yml',import.meta.url),'utf8');
const deploy=wf.indexOf('      - name: Deploy protected QA Worker and inject disposable auth token only');
const preflight=wf.indexOf('      - name: Verify deployed two-layer QA authentication without Gemini or D1 writes');
const paid=wf.indexOf('      - name: Test real deployed application');
assert.ok(deploy>=0 && preflight>deploy && paid>preflight,
 'auth probe must run between deployment and any Gemini-backed QA test');
assert.ok(wf.includes('run: node scripts/qa-pr61-deployed-auth-preflight.mjs'));
assert.ok(wf.includes('--secrets-file "$QA_AUTH_SECRET_FILE"'),
 'auth secrets must be deployed atomically along with exact QA Worker code');
assert.ok(wf.includes('JSON.stringify({QA_INGESTION_TOKEN:token,INGESTION_TOKEN:token})'),
 'outer and inner QA auth must use the exact same disposable token');
assert.ok(wf.includes("trap 'rm -f \"$QA_AUTH_SECRET_FILE\"' EXIT"),
 'temporary on-runner secret file must be deleted even if deploy fails');
assert.ok(!wf.includes('wrangler secret put QA_INGESTION_TOKEN')&&!wf.includes('wrangler secret put INGESTION_TOKEN'),
 'sequential separately-deployed auth secrets can cause 401 version mismatch');
assert.ok(wf.includes('npx wrangler deploy --config wrangler.qa-app-deployed.json'),
 'deployment must keep the explicitly isolated Worker config');
console.log('PASS: QA-only atomic double-secret deploy and bounded read-only authentication preflight, no Gemini/D1 access');
