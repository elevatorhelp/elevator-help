/**
 * Public/authorized GitHub Actions archive ingestion log *aggregates*, not
 * private log contents. No Drive filenames, IDs or log text leave this helper.
 * This is an observation of the selected workflow run, not D1 checkpoint truth.
 */
export type ArchiveRunMetrics = {
  supportedFiles: number;
  pending: { evidence: number; raw: number; map: number };
  processed: { evidence: number; raw: number; map: number };
  selectedPhase: "evidence" | "raw" | "map";
  attempted: number | null;
  failed: number | null;
  pendingOperations: number;
  newFiles: null;
  estimatedRemainingDays: null;
  source: "GitHub Actions Live Archive sync log";
  warning: string;
};
const ROOT = "https://api.github.com/repos/elevatorhelp/elevator-help";
const MAX_LOG_BYTES = 2_000_000;

function matchInt(content: string, pattern: RegExp): number | null {
  const match = content.match(pattern);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

export function parseArchiveRunMetrics(log: string): ArchiveRunMetrics | null {
  const supportedFiles = matchInt(log, /Found (\d+) supported documents in configured Drive scope/);
  const pending = /Archive backlog \(all pending\): evidence=(\d+), raw=(\d+), map=(\d+)/.exec(log);
  const phase = /Ingestion phase preference: (?:evidence|raw|map); selected: (evidence|raw|map)/.exec(log)?.[1];
  if (supportedFiles === null || !pending || !["evidence","raw","map"].includes(phase || "")) return null;
  const numbers = pending.slice(1,4).map(Number);
  if (numbers.some(n=>!Number.isSafeInteger(n)||n<0||n>supportedFiles)) return null;
  const [evidence,raw,map] = numbers;
  const attempted = matchInt(log,/Done\. Attempted (\d+) file\(s\);/);
  const failed = matchInt(log,/Done\. Attempted \d+ file\(s\); (\d+) failed;/);
  if (attempted!==null && (attempted>supportedFiles || failed!==null && failed>attempted)) return null;
  return {
    supportedFiles,
    pending: { evidence,raw,map },
    processed: { evidence:supportedFiles-evidence,raw:supportedFiles-raw,map:supportedFiles-map },
    selectedPhase: phase as "evidence"|"raw"|"map",
    attempted,failed,
    pendingOperations:evidence+raw+map,
    newFiles:null,
    estimatedRemainingDays:null,
    source:"GitHub Actions Live Archive sync log",
    warning:"Snapshot is from the start of this run, BEFORE its attempted files; pending phases overlap by design. New-file count and ETA require verified historical snapshots and measured successful throughput. Evidence/RAW/Map completion are separate. GitHub job logs may expire.",
  };
}

async function responseTextBounded(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) { await reader.cancel(); return null; }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset=0; for (const c of chunks) { bytes.set(c,offset); offset+=c.length; }
    return new TextDecoder("utf-8").decode(bytes);
  } finally { reader.releaseLock(); }
}

export async function readArchiveRunMetrics(runId: number, options: {
  token?: string; fetchImpl?: typeof fetch;
} = {}): Promise<ArchiveRunMetrics | null> {
  if (!Number.isSafeInteger(runId)||runId<=0) return null;
  const fetcher = options.fetchImpl ?? fetch;
  const headers: Record<string,string> = {
    Accept:"application/vnd.github+json", "User-Agent":"elevator-help-admin-metrics",
  };
  if (options.token) headers.Authorization="Bearer "+options.token;
  try {
    const jobs = await fetcher(`${ROOT}/actions/runs/${runId}/jobs?per_page=10`, {
      headers, cache:"no-store", signal:AbortSignal.timeout(8000),
    });
    if (!jobs.ok) return null;
    const data: unknown = await jobs.json();
    const values = data && typeof data==="object" && Array.isArray((data as {jobs?:unknown[]}).jobs) ? (data as {jobs:unknown[]}).jobs : [];
    const ingest = values.find(v => v && typeof v==="object" &&
      (v as {name?:unknown}).name==="ingest" && (v as {conclusion?:unknown}).conclusion==="success") as {id?:unknown}|undefined;
    if (!ingest || typeof ingest.id!=="number" || !Number.isSafeInteger(ingest.id)||ingest.id<=0) return null;
    const res = await fetcher(`${ROOT}/actions/jobs/${ingest.id}/logs`, {
      headers, cache:"no-store", signal:AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const log = await responseTextBounded(res, MAX_LOG_BYTES);
    return log===null?null:parseArchiveRunMetrics(log);
  } catch { return null; }
}
