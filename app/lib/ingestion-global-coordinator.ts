/**
 * Exclusive whole-archive D1 coordinator and versioned checkpoint CAS.
 *
 * This module deliberately does NOT promise an atomic transaction spanning D1
 * and external Vectorize. Real parallel writers remain disabled until their
 * mutation endpoints enforce generation-qualified publication/read visibility.
 */
import { createHash } from "node:crypto";

export type ArchiveLease = { jobKey: string; owner: string; generation: number };
type D1Prepared = {
  bind: (...params: unknown[]) => D1Prepared;
  first: () => Promise<Record<string, unknown> | null>;
};
export type CoordinatorDB = { prepare: (sql: string) => D1Prepared };
const MAX_STATE_BYTES = 1_250_000;
const MAX_LEASE_MS = 300_000;
const MIN_LEASE_MS = 30_000;

export function validateArchiveLease(lease: ArchiveLease): void {
  if (!lease || typeof lease.jobKey !== "string" ||
      !/^drive:[A-Za-z0-9_-]{10,128}$/.test(lease.jobKey) ||
      typeof lease.owner !== "string" ||
      !/^gh-[1-9][0-9]{5,19}-[a-f0-9]{16,32}$/.test(lease.owner) ||
      !Number.isSafeInteger(lease.generation) || lease.generation < 1) {
    throw new Error("INVALID_GLOBAL_ARCHIVE_LEASE");
  }
}
export function validateArchiveJob(jobKey: string, owner: string, ttlMs: number) {
  validateArchiveLease({ jobKey, owner, generation: 1 });
  if (!Number.isSafeInteger(ttlMs) || ttlMs < MIN_LEASE_MS || ttlMs > MAX_LEASE_MS) {
    throw new Error("INVALID_GLOBAL_ARCHIVE_LEASE_TTL");
  }
}
function validNow(now: number) {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("INVALID_COORDINATOR_CLOCK");
}
function validRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) {
    throw new Error("INVALID_COORDINATOR_REVISION");
  }
}

export async function claimGlobalArchiveLease(
  db: CoordinatorDB, jobKey: string, owner: string, ttlMs = 180_000, now = Date.now(),
): Promise<ArchiveLease | null> {
  validateArchiveJob(jobKey, owner, ttlMs); validNow(now);
  const row = await db.prepare(`
    INSERT INTO ingestion_global_leases
      (job_key,owner,generation,lease_until_ms,updated_at_ms)
    VALUES (?,?,1,?,?)
    ON CONFLICT(job_key) DO UPDATE SET
      owner=excluded.owner,
      generation=ingestion_global_leases.generation+1,
      lease_until_ms=excluded.lease_until_ms,
      updated_at_ms=excluded.updated_at_ms
    WHERE ingestion_global_leases.lease_until_ms <= ?
    RETURNING owner,generation,lease_until_ms
  `).bind(jobKey,owner,now+ttlMs,now,now).first();
  if (!row || row.owner!==owner || !Number.isSafeInteger(row.generation) ||
      Number(row.lease_until_ms)<=now) return null;
  return {jobKey,owner,generation:Number(row.generation)};
}

export async function renewGlobalArchiveLease(
  db: CoordinatorDB, lease: ArchiveLease, ttlMs=180_000, now=Date.now(),
): Promise<boolean> {
  validateArchiveLease(lease); validateArchiveJob(lease.jobKey,lease.owner,ttlMs);validNow(now);
  const row=await db.prepare(`
    UPDATE ingestion_global_leases
    SET lease_until_ms=MAX(lease_until_ms,?),updated_at_ms=?
    WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    RETURNING generation
  `).bind(now+ttlMs,now,lease.jobKey,lease.owner,lease.generation,now).first();
  return Number(row?.generation)===lease.generation;
}

export async function releaseGlobalArchiveLease(
  db: CoordinatorDB, lease: ArchiveLease, now=Date.now(),
): Promise<boolean> {
  validateArchiveLease(lease);validNow(now);
  const row=await db.prepare(`
    UPDATE ingestion_global_leases
    SET lease_until_ms=?,updated_at_ms=?
    WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    RETURNING generation
  `).bind(now,now,lease.jobKey,lease.owner,lease.generation,now).first();
  return Number(row?.generation)===lease.generation;
}

function serializeCheckpoint(state: unknown): {json: string; checksum: string} {
  if (!state || typeof state!=="object" || Array.isArray(state)) {
    throw new Error("INVALID_DURABLE_CHECKPOINT_STATE");
  }
  const parsed=state as Record<string,unknown>;
  if (parsed.version!==3 || !parsed.scopes || typeof parsed.scopes!=="object" ||
      Array.isArray(parsed.scopes) || Object.keys(parsed.scopes).length===0 ||
      parsed.parallelShard!==undefined) {
    throw new Error("INVALID_DURABLE_CHECKPOINT_STATE");
  }
  const json=JSON.stringify(state);
  if (typeof json!=="string" || Buffer.byteLength(json,"utf8")>MAX_STATE_BYTES)
    throw new Error("DURABLE_CHECKPOINT_SIZE_LIMIT");
  const checksum=createHash("sha256").update(json,"utf8").digest("hex");
  return {json,checksum};
}

export async function writeDurableArchiveCheckpoint(
  db: CoordinatorDB, lease: ArchiveLease, previousVersion: number, state: unknown,
  now=Date.now(),
): Promise<{version:number;checksum:string}|null> {
  validateArchiveLease(lease);validRevision(previousVersion);validNow(now);
  const {json,checksum}=serializeCheckpoint(state);
  // Lease existence and checkpoint version update are checked in the SAME
  // single D1 SQL statement. An expired/stale worker cannot update it.
  const row=await db.prepare(`
    INSERT INTO ingestion_worker_checkpoints
      (job_key,version,lease_generation,checksum,state_json,updated_at_ms)
    SELECT ?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM ingestion_global_leases
      WHERE job_key=? AND owner=? AND generation=? AND lease_until_ms>?
    )
    ON CONFLICT(job_key) DO UPDATE SET
      version=excluded.version,
      lease_generation=excluded.lease_generation,
      checksum=excluded.checksum,
      state_json=excluded.state_json,
      updated_at_ms=excluded.updated_at_ms
    WHERE ingestion_worker_checkpoints.version=?
      AND ingestion_worker_checkpoints.lease_generation<=excluded.lease_generation
    RETURNING version
  `).bind(lease.jobKey,previousVersion+1,lease.generation,checksum,json,now,
           lease.jobKey,lease.owner,lease.generation,now,previousVersion).first();
  if (Number(row?.version)!==previousVersion+1) return null;
  return {version:previousVersion+1,checksum};
}

export async function readDurableArchiveCheckpoint(
  db: CoordinatorDB, lease: ArchiveLease, now=Date.now(),
): Promise<{version:number; state:Record<string,unknown>;checksum:string}|null> {
  validateArchiveLease(lease);validNow(now);
  const row=await db.prepare(`
    SELECT c.version,c.checksum,c.state_json
    FROM ingestion_worker_checkpoints c
    JOIN ingestion_global_leases l ON l.job_key=c.job_key
    WHERE l.job_key=? AND l.owner=? AND l.generation=? AND l.lease_until_ms>?
  `).bind(lease.jobKey,lease.owner,lease.generation,now).first();
  if (!row) return null;
  if (typeof row.state_json!=="string" ||
      Buffer.byteLength(row.state_json,"utf8")>MAX_STATE_BYTES ||
      typeof row.checksum!=="string" ||
      !/^[a-f0-9]{64}$/.test(row.checksum) ||
      createHash("sha256").update(row.state_json,"utf8").digest("hex")!==row.checksum ||
      !Number.isSafeInteger(row.version) || Number(row.version)<1) {
    throw new Error("DURABLE_CHECKPOINT_INTEGRITY_FAILURE");
  }
  let state:unknown;
  try { state=JSON.parse(row.state_json); }
  catch {throw new Error("DURABLE_CHECKPOINT_INTEGRITY_FAILURE");}
  try { serializeCheckpoint(state); }
  catch {throw new Error("DURABLE_CHECKPOINT_INTEGRITY_FAILURE");}
  return {version:Number(row.version),state:state as Record<string,unknown>,checksum:row.checksum};
}
