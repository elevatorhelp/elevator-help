const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const env = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP']) {
  if (process.env[key]) env[key] = process.env[key];
}
// Keep child Node processes offline too; do not inherit credentials or personal config.
env.NODE_OPTIONS = '--require="' + require('node:path').resolve('scripts/qa-offline-network-guard.cjs').replaceAll('\\', '/') + '"';
const excluded = new Set(['test-live-archive-offline.mjs', 'test-backfill-guards-offline.mjs', 'test-regular-table-backup.mjs']);
const tracked = spawnSync('git', ['ls-files', '--', 'scripts'], {encoding: 'utf8'});
if (tracked.status !== 0) throw new Error('TRACKED_TEST_DISCOVERY_FAILED');
const files = tracked.stdout.trim().split(/\r?\n/).map(f => f.replace(/^scripts\//, '')).filter(f => /^(test-.*\.(ts|mjs)|adaptive-ingestion-controller\.test\.mjs)$/.test(f) && !excluded.has(f));
if (files.length < 38) throw new Error('OFFLINE_REGRESSION_SUITE_INCOMPLETE');
const results = [];
for (const file of files) {
  const args = ['--require', './scripts/qa-offline-network-guard.cjs', '--experimental-sqlite', '--experimental-strip-types'];
  if (file === 'test-d1-lease-sql.mjs' || file === 'adaptive-ingestion-controller.test.mjs') args.push('--test');
  args.push('scripts/' + file);
  const start = Date.now();
  const r = spawnSync(process.execPath, args, {env, encoding: 'utf8', timeout: 20000});
  const result = {command: 'node ' + args.join(' '), exit: r.status, milliseconds: Date.now()-start, stdout: r.stdout, stderr: r.stderr, error: r.error?.message};
  results.push(result);
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${file} (${result.milliseconds}ms)`);
}
fs.writeFileSync('qa-offline-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({passed: results.filter(r=>r.exit===0).length, failed: results.filter(r=>r.exit!==0).length}));
process.exitCode = results.some(r=>r.exit!==0) ? 1 : 0;
