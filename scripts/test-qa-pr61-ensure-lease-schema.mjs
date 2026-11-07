// Offline execution of the real QA schema preflight with a fake npx executable.
// No network, Cloudflare, D1, Vectorize, Gemini or production credentials.
import assert from 'node:assert/strict';
import {chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

if (process.platform === 'win32') {
  console.log('SKIP: POSIX fake npx launcher is tested on Ubuntu Build Check');
  process.exit(0);
}
const root = mkdtempSync(join(tmpdir(), 'pr61-qa-preflight-'));
const sourceRoot = new URL('../', import.meta.url);
const scripts = join(root, 'scripts');
const fakeBin = join(root, 'bin');
const log = join(root, 'npx-called.log');
const resultFile = join(root, 'wrangler-response.json');
try {
  mkdirSync(scripts);
  mkdirSync(fakeBin);
  for (const file of ['qa-pr61-ensure-lease-schema.mjs', 'qa-pr61-assert-isolated-config.mjs'])
    copyFileSync(new URL('./' + file, import.meta.url), join(scripts, file));
  for (const file of ['wrangler.qa-app.json', 'wrangler.qa-app-deployed.json'])
    copyFileSync(new URL(file, sourceRoot), join(root, file));
  const validResult = [{success: true, results: [
    {name: 'job_key'}, {name: 'lease_until_ms'}, {name: 'updated_at_ms'},
  ]}];
  writeFileSync(resultFile, JSON.stringify(validResult));
  const npx = join(fakeBin, 'npx');
  writeFileSync(npx, "#!/bin/sh\nprintf \"called\\\\n\" >> \"$QA_NPX_CALL_LOG\"\n/bin/cat \"$QA_NPX_RESULT_FILE\"\n");
  chmodSync(npx, 0o700);
  const localConfigPath = join(root, 'wrangler.qa-app.json');
  const original = JSON.parse(readFileSync(localConfigPath, 'utf8'));
  const run = () => spawnSync(process.execPath, [join(scripts, 'qa-pr61-ensure-lease-schema.mjs')], {
    encoding: 'utf8',
    env: {...process.env, PATH: fakeBin, QA_NPX_CALL_LOG: log,
      QA_NPX_RESULT_FILE: resultFile},
    timeout: 10000,
  });
  const positive = run();
  assert.equal(positive.status, 0, positive.stderr);
  assert.match(positive.stdout, /PASS: isolated QA lease schema/);
  assert.equal(readFileSync(log, 'utf8'), 'called\n',
    'valid dual-index QA preflight must reach mocked D1 read exactly once');

  // A success-looking first entry must not hide malformed or failed D1 results.
  // The previous parser accepted missing success and partial failures.
  for (const [name, payload] of [
    ['empty result array', []],
    ['missing success flag', [{results: validResult[0].results}]],
    ['false success flag', [{success: false, results: validResult[0].results}]],
    ['partial batch failure', [validResult[0], {success: false, results: []}]],
    ['missing results array', [{success: true}]],
    ['null results array', [{success: true, results: null}]],
  ]) {
    writeFileSync(resultFile, JSON.stringify(payload));
    writeFileSync(log, '');
    const result = run();
    assert.notEqual(result.status, 0, name + ' must fail closed');
    assert.equal(readFileSync(log, 'utf8'), 'called\n',
      name + ' should fail on the first mocked D1 response');
  }
  writeFileSync(resultFile, JSON.stringify(validResult));

  for (const [name, mutate] of [
    ['aliased dual Vectorize indices', c => {c.vectorize[1].index_name = c.vectorize[0].index_name;}],
    ['missing secondary index', c => {c.vectorize.pop();}],
    ['empty index array', c => {c.vectorize = [];}],
    ['production index substitution', c => {c.vectorize[0].index_name = 'elevator-help';}],
  ]) {
    const unsafe = structuredClone(original);
    mutate(unsafe);
    writeFileSync(localConfigPath, JSON.stringify(unsafe));
    writeFileSync(log, '');
    const result = run();
    assert.notEqual(result.status, 0, name + ' must fail closed');
    assert.equal(readFileSync(log, 'utf8'), '', name + ' reached mocked D1 despite invalid config');
  }
  console.log('PASS: QA schema preflight rejects six malformed Wrangler responses and four unsafe configs (offline mock)');
} finally {
  rmSync(root, {recursive: true, force: true});
}
