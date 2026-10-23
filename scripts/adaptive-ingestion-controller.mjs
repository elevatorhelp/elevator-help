// Pure, offline-first capacity planning for Live Archive ingestion.
// No external calls or production mutations in this module.
export const PHASES = Object.freeze(["evidence", "raw", "map"]);
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const nonnegative = (n) => finite(n) && n >= 0;
const count = (n) => nonnegative(n) ? Math.floor(n) : 0;
export function planIngestion({queues = {}, cursor = 0, telemetry = null, policy = {}, now = Date.now()} = {}) {
  const baseline = Math.max(1, count(policy.baselineFiles ?? 2));
  const hardMax = Math.min(20, count(policy.maxFiles ?? baseline));
  const normalizedCursor = count(cursor) % PHASES.length;
  const ordered = PHASES.map((_, i) => PHASES[(normalizedCursor + i) % PHASES.length]);
  const phase = ordered.find(p => count(queues[p]) > 0) ?? null;
  if (!phase) return {phase:null, maxFiles:0, nextCursor:normalizedCursor, reason:"empty"};
  const nextCursor = (PHASES.indexOf(phase) + 1) % PHASES.length;
  if (!policy.adaptiveEnabled) return {phase,maxFiles:Math.min(baseline,hardMax,count(queues[phase])),nextCursor,reason:"baseline"};
  const valid = telemetry && nonnegative(telemetry.observedAt) && nonnegative(now) &&
    now >= telemetry.observedAt && now - telemetry.observedAt <= 15 * 60_000 &&
    ["d1Remaining","geminiRemaining","runtimeRemainingMs","d1PerFile","geminiPerFile","runtimePerFileMs"].every(k=>nonnegative(telemetry[k])) &&
    telemetry.d1PerFile > 0 && telemetry.geminiPerFile > 0 && telemetry.runtimePerFileMs > 0;
  if (!valid) return {phase,maxFiles:Math.min(baseline,hardMax,count(queues[phase])),nextCursor,reason:"telemetry-unavailable"};
  const d1 = Math.floor(telemetry.d1Remaining * .8 / telemetry.d1PerFile);
  const gemini = Math.floor(telemetry.geminiRemaining * .9 / telemetry.geminiPerFile);
  const runtime = Math.floor(telemetry.runtimeRemainingMs / telemetry.runtimePerFileMs);
  const maxFiles = Math.max(0,Math.min(hardMax,count(queues[phase]),d1,gemini,runtime));
  return {phase,maxFiles,nextCursor,reason:maxFiles===0?"budget-exhausted":"adaptive"};
}
