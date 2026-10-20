// Offline, no-network lower-bound estimator for Issue #50.
// A phase-document operation is not a unique document and may require multiple runs.
export function estimateArchiveCapacity({ evidence, raw, map, runsPerDay, maxFiles, targetDays = null }) {
  const counts = { evidence, raw, map, runsPerDay, maxFiles };
  for (const [key, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < (key === "runsPerDay" || key === "maxFiles" ? 1 : 0)) {
      throw new TypeError(`${key} must be a valid nonnegative integer${key === "runsPerDay" || key === "maxFiles" ? " greater than zero" : ""}`);
    }
  }
  if (targetDays !== null && (!Number.isSafeInteger(targetDays) || targetDays < 1)) {
    throw new TypeError("targetDays must be a positive integer");
  }
  const operations = evidence + raw + map;
  if (!Number.isSafeInteger(operations)) throw new RangeError("Backlog operation count overflow");
  const nominalDailyCapacity = runsPerDay * maxFiles;
  if (!Number.isSafeInteger(nominalDailyCapacity)) throw new RangeError("Daily capacity overflow");
  const optimisticDays = operations / nominalDailyCapacity;
  // This figure is NEVER an ETA: a raw/map document can need many partial runs;
  // API calls, rate limits, D1 writes and newly arriving files are excluded.
  const minimumFilesPerRunForTarget = targetDays === null
    ? null : Math.ceil(operations / (targetDays * runsPerDay));
  return {
    pendingPhaseOperations: operations,
    nominalDailyCapacity,
    optimisticLowerBoundDays: optimisticDays,
    targetDays,
    minimumFilesPerRunForTarget,
    assumptions: [
      "Counts are pending phase-document operations, not distinct documents.",
      "Every selected phase-document completes in one run (optimistic and often false).",
      "No new uploads, retries, partial documents, API throttling or D1/Vectorize limits are included.",
      "This report performs no Drive access, API request or ingestion."
    ]
  };
}
function parseArgs(args) {
  const allowed = new Set(["evidence", "raw", "map", "runs-per-day", "max-files", "target-days"]);
  const found = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!flag?.startsWith("--") || !allowed.has(flag.slice(2)) || i + 1 >= args.length) {
      throw new Error("Usage: node scripts/archive-capacity.mjs --evidence N --raw N --map N --runs-per-day N --max-files N [--target-days N]");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(found, key) || !/^(0|[1-9][0-9]*)$/.test(args[i + 1])) {
      throw new Error(`Invalid or repeated integer: ${flag}`);
    }
    found[key] = Number(args[i + 1]);
  }
  for (const key of ["evidence", "raw", "map", "runs-per-day", "max-files"]) {
    if (!Object.hasOwn(found, key)) throw new Error(`Missing required --${key}`);
  }
  return {
    evidence: found.evidence, raw: found.raw, map: found.map,
    runsPerDay: found["runs-per-day"], maxFiles: found["max-files"],
    targetDays: found["target-days"] ?? null
  };
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    console.log(JSON.stringify(estimateArchiveCapacity(parseArgs(process.argv.slice(2))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
