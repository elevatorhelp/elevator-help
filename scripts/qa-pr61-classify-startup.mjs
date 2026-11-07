// Offline-only classifier for the already-private Wrangler startup log.
// Never output log lines, endpoint URLs, document data, request bodies or credential values.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function classifyQaWorkerStartup(log) {
  if (typeof log !== 'string' || log.length === 0) return 'LOG_EMPTY';
  const sample = log.slice(-131072); // bound classification work, never print this string
  if (/\b(?:remote (?:development|preview).{0,90}(?:not supported|disabled|unavailable)|preview.{0,90}not (?:available|supported)|unsupported.{0,90}remote)\b/i.test(sample))
    return 'REMOTE_PREVIEW_UNAVAILABLE';
  if (/\b(?:unauthori[sz]ed|forbidden|invalid api token|authentication error|insufficient permissions?|permission denied|not authorized)\b|error code:\s*10000\b/i.test(sample))
    return 'CLOUDFLARE_AUTH_OR_PERMISSION';
  if (/(?:binding|vectorize|d1|rate.?limit).{0,100}(?:not found|does not exist|not supported|invalid|missing)|(not found|does not exist|unsupported|invalid).{0,100}(?:binding|vectorize|d1)/i.test(sample))
    return 'QA_RESOURCE_OR_BINDING';
  if (/\b(?:EADDRINUSE|address already in use|port already in use)\b/i.test(sample))
    return 'LOCAL_PORT_CONFLICT';
  if (/(?:script|worker|bundle).{0,65}(?:too large|size limit|exceeds.{0,35}limit)/i.test(sample))
    return 'WORKER_SIZE_LIMIT';
  if (/\b(?:ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)\b|fetch failed|network error|socket hang up|could not connect/i.test(sample))
    return 'NETWORK_OR_PREVIEW_CONNECTION';
  if (/\b(?:error|failed|exception)\b/i.test(sample))
    return 'OTHER_STARTUP_ERROR';
  return 'UNKNOWN_OR_SILENT_EXIT';
}

export function safeQaWorkerStartupMessage(log) {
  // Only a fixed-label, finite classification can leave this process.
  return '::error::QA_WORKER_STARTUP_' + classifyQaWorkerStartup(log) +
    ' (raw Wrangler diagnostics withheld to protect credentials and archive data)';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Explicit path allowlist: never accept an arbitrary file path from the runner.
  if (process.argv[2] !== '/tmp/qa-app-worker.log') {
    console.error('::error::QA_WORKER_DIAGNOSTIC_PATH_REJECTED');
    process.exitCode = 2;
  } else {
    let log = '';
    try {
      log = readFileSync('/tmp/qa-app-worker.log', 'utf8');
    } catch {
      // Do not echo filesystem error details or unexpected paths.
    }
    console.error(safeQaWorkerStartupMessage(log));
  }
}
