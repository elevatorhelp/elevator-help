const fs = require('node:fs');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const source = fs.readFileSync('.github/workflows/qa-pr63-exact-head-build.yml', 'utf8');
const doc = YAML.parseDocument(source, {uniqueKeys: true});
assert.deepEqual(doc.errors, []);
const w = doc.toJS();
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(pkg.scripts['cf:build'], 'opennextjs-cloudflare build');
assert.equal(pkg.scripts.build, 'next build --webpack');
for (const hook of ['precf:build', 'postcf:build', 'prebuild', 'postbuild']) {
  assert.equal(pkg.scripts[hook], undefined, `Unexpected build lifecycle hook: ${hook}`);
}
assert.deepEqual(Object.keys(w.on), ['workflow_dispatch']);
assert.deepEqual(w.permissions, {contents: 'read'});
assert.deepEqual(w.on.workflow_dispatch.inputs.approved_sha, {
  description: 'Full reviewed SHA; must equal dispatched ref HEAD', required: true, type: 'string'
});
assert.equal(w.concurrency['cancel-in-progress'], false);
assert.equal(w.concurrency.group, 'manual-exact-head-build');
assert.deepEqual(Object.keys(w.jobs), ['build']);
const j = w.jobs.build;
assert.equal(j.permissions, undefined);
assert.equal(j.environment, undefined);
assert.equal(j.secrets, undefined);
assert.equal(j['runs-on'], 'ubuntu-24.04');
assert.equal(j['timeout-minutes'], 30);
assert.equal(j.if, "github.event_name == 'workflow_dispatch'");
const steps = j.steps;
assert.match(steps[0].run, /\^\[0-9a-f\]\{40\}\$/);
assert.ok(steps[0].run.includes('test "$APPROVED_SHA" = "$DISPATCH_SHA"'));
assert.equal(steps[0].env.APPROVED_SHA, '${{ inputs.approved_sha }}');
assert.equal(steps[0].env.DISPATCH_SHA, '${{ github.sha }}');
assert.equal(steps[1].with.ref, '${{ inputs.approved_sha }}');
assert.equal(steps[1].with['persist-credentials'], false);
assert.equal(steps[1].with['fetch-depth'], 1);
assert.equal(steps[1].with.submodules, false);
assert.ok(steps[2].run.includes('git rev-parse HEAD'));
assert.equal(steps[3].with['node-version'], '22');
for (const s of steps.filter(s => s.uses)) assert.match(s.uses, /@[0-9a-f]{40}$/);
const runs = steps.map(s=>s.run || '').join('\n');
for(const command of ['npm ci --ignore-scripts --no-audit --no-fund',
  'node scripts/qa-ci-offline.cjs', 'npx --no-install tsc --noEmit',
  'npm run cf:build', 'npm audit --omit=dev --audit-level=high',
  'node scripts/test-security-baseline.mjs']) assert.ok(runs.includes(command), command);
assert.doesNotMatch(source, /secrets\.|id-token|write-all|continue-on-error|gemini|environment:/i);
assert.doesNotMatch(runs, /wrangler|deploy|curl|wget/i);
assert.ok(steps.every(s=>!s['continue-on-error']));
console.log('PASS: parsed YAML; manual-only, exact SHA, Node22 Ubuntu, pinned actions, no credentials, required gates');
