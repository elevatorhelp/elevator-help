// Pure, in-memory reference model for a future D1-backed worker-lease protocol.
// No network, cloud bindings, paid APIs, or ingestion side effects.
// IMPORTANT: production must use atomic conditional SQL writes, not this Map.
export const PHASES = Object.freeze(["evidence", "raw", "map"]);
const predecessors = { evidence: null, raw: "evidence", map: "raw" };
const keyFor = ({ fileId, fingerprint, phase }) => JSON.stringify([fileId, fingerprint, phase]);
function validate(job) {
  if (!job || ![job.fileId, job.fingerprint, job.phase].every(v => typeof v === "string" && v.length > 0) || !PHASES.includes(job.phase)) {
    throw new TypeError("fileId, fingerprint and a supported phase are required");
  }
}
function validateTime(now, leaseMs) {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(leaseMs) || leaseMs < 1) {
    throw new TypeError("Invalid clock or lease interval");
  }
  if (!Number.isSafeInteger(now + leaseMs)) throw new RangeError("Lease timestamp overflow");
}
export class OfflineJobQueue {
  #jobs = new Map();
  constructor({ maxAttempts = 3 } = {}) {
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new TypeError("Invalid maxAttempts");
    this.maxAttempts = maxAttempts;
  }
  enqueue(job) {
    validate(job);
    const key = keyFor(job);
    if (this.#jobs.has(key)) return false;
    this.#jobs.set(key, { fileId: job.fileId, fingerprint: job.fingerprint, phase: job.phase, status: "pending", attempts: 0, generation: 0, owner: null, leaseUntil: null });
    return true;
  }
  #predecessorComplete(job) {
    const phase = predecessors[job.phase];
    return phase === null || this.#jobs.get(keyFor({ ...job, phase }))?.status === "completed";
  }
  claim({ workerId, now, leaseMs }) {
    if (!workerId || typeof workerId !== "string") throw new TypeError("workerId required");
    validateTime(now, leaseMs);
    for (const [key, job] of this.#jobs) {
      if (job.status === "completed" || job.status === "dead") continue;
      if (!this.#predecessorComplete(job)) continue;
      if (job.status === "leased" && job.leaseUntil > now) continue;
      if (job.attempts >= this.maxAttempts) {
        this.#jobs.set(key, { ...job, status: "dead", owner: null, leaseUntil: null });
        continue;
      }
      const next = { ...job, status: "leased", attempts: job.attempts + 1, generation: job.generation + 1, owner: workerId, leaseUntil: now + leaseMs };
      this.#jobs.set(key, next);
      return { ...next };
    }
    return null;
  }
  #isOwner(job, lease, now) {
    return job?.status === "leased" && job.owner === lease?.owner &&
      job.generation === lease?.generation && job.leaseUntil > now;
  }
  heartbeat(lease, { now, leaseMs }) {
    validateTime(now, leaseMs);
    const key = keyFor(lease);
    const current = this.#jobs.get(key);
    if (!this.#isOwner(current, lease, now)) return false;
    // The owner cannot shorten a previously granted lease.
    this.#jobs.set(key, { ...current, leaseUntil: Math.max(current.leaseUntil, now + leaseMs) });
    return true;
  }
  complete(lease, { now }) {
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Invalid clock");
    const key = keyFor(lease);
    const current = this.#jobs.get(key);
    if (!this.#isOwner(current, lease, now)) return false;
    this.#jobs.set(key, { ...current, status: "completed", owner: null, leaseUntil: null });
    return true;
  }
  fail(lease, { now }) {
    if (!Number.isSafeInteger(now) || now < 0) throw new TypeError("Invalid clock");
    const key = keyFor(lease);
    const current = this.#jobs.get(key);
    if (!this.#isOwner(current, lease, now)) return false;
    const status = current.attempts >= this.maxAttempts ? "dead" : "pending";
    this.#jobs.set(key, { ...current, status, owner: null, leaseUntil: null });
    return true;
  }
  snapshot() {
    const jobs = [...this.#jobs.values()].map(j => ({ ...j }));
    const counts = Object.fromEntries(["pending", "leased", "completed", "dead"].map(s => [s, jobs.filter(j => j.status === s).length]));
    return { counts, jobs };
  }
}
