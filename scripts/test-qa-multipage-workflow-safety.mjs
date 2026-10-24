import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const wf=read('.github/workflows/qa-pr61-multipage.yml');
const events=wf.split('on:\n')[1].split('permissions:')[0];
assert.deepEqual([...events.matchAll(/^  (\w+):/gm)].map(x=>x[1]),['workflow_dispatch']);
assert.match(events,/allow_paid_gemini:\s*\n\s*description:[^\n]*\n\s*type: boolean\s*\n\s*default: false/);
const gate="inputs.allow_paid_gemini == true && steps.secret-check.outputs.positive == 'true'";
const steps=wf.split(/\n      - name: /).slice(1);
const check=steps.find(s=>s.includes('id: secret-check'));
assert.match(check,/ALLOW_PAID_GEMINI: \$\{\{ inputs.allow_paid_gemini \}\}/);
assert.match(check,/echo "positive=false"[\s\S]*?ALLOW_PAID_GEMINI:-false[\s\S]*?exit 0[\s\S]*?if npx wrangler secret list/);
assert.match(check,/then\s*\n\s*echo "positive=true"[\s\S]*?else\s*\n\s*echo "::error::[^\n]*\n\s*exit 1/);
const app=steps.find(s=>s.startsWith('Test real deployed application'));
assert.ok(app.includes(`QA_NEGATIVE_ONLY: \u0024{{ ${gate} && 'false' || 'true' }}`));
for(const name of ['Real multi-page Drive','Verify real Drive','Verify interrupted publication']){
 const step=steps.find(s=>s.startsWith(name));assert.ok(step?.includes(`if: ${gate}`),name);
}
// Group only workflows demonstrably using the same worker/database/index.
const group=s=>s.match(/^  group: (.+)$/m)?.[1];
for(const [name,config] of [['actual-app','qa-app'],['real-worker','qa-staged'],['cloudflare-secret','qa-app-deployed'],['drive-readback','qa-app-deployed']]){
 const other=read(`.github/workflows/qa-pr61-${name}.yml`);
 const a=JSON.parse(read(`wrangler.${config}.json`));
 const b=JSON.parse(read('wrangler.qa-app-deployed.json'));
 assert.equal(a.d1_databases[0].database_id,b.d1_databases[0].database_id);
 assert.deepEqual(a.vectorize,b.vectorize);
 assert.equal(group(other),group(wf),name);
 assert.match(other,/cancel-in-progress: false/);
}
assert.notEqual(group(read('.github/workflows/qa-pr61-d1-restore.yml')),group(wf));
// Execute the real negative branch with a local fetch substitute; reject any
// paid-capable action, missing lease, wrong payload, or fallthrough to positives.
const source=read('scripts/qa-pr61-full-app-e2e.mjs').replace(/^import assert[^\n]*\n/,'');
const calls=[];const stopped={};
await assert.rejects(vm.runInNewContext(`(async()=>{${source}})()`,{
 assert,console:{log(){}},process:{env:{QA_APP_BASE_URL:'https://offline.invalid',QA_INGESTION_TOKEN:'fixture',QA_NEGATIVE_ONLY:'true'},exit(code){assert.equal(code,0);throw stopped;}},
 fetch:async(url,options)=>{const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body).sort(),['action','documentId']);calls.push(body.action);return {status:409,text:async()=>JSON.stringify({error:'INGESTION_LEASE_REQUIRED'})};}
}),e=>e===stopped);
assert.deepEqual(calls,['status','upsert','publish_full']);
console.log('PASS: multipage manual/default-off, explicit paid/secret gates, shared concurrency, executable negative-only branch');
