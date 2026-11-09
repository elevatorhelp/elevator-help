// Offline split/verification of the existing GitHub Actions archive checkpoint.
// Must never create an empty checkpoint, and never call Drive or paid APIs.
import { readIngestionState, writeIngestionState } from "./drive-ingest.mjs";
import {
  splitIngestionState, assertShardState, validateShardParameters,
} from "./archive-sharding.mjs";

const index = Number(process.env.ARCHIVE_SHARD_INDEX);
const count = Number(process.env.ARCHIVE_SHARD_COUNT);
validateShardParameters(index, count);
const path = process.env.STATE_PATH || ".ingestion-state/drive.json";
const allowMigration = process.env.ALLOW_LEGACY_SHARD_BOOTSTRAP === "true";

const state = await readIngestionState(path, false);
if (state.parallelShard) {
  assertShardState(state, index, count);
  console.log("PASS: restored shard checkpoint verified; no migration needed");
} else {
  if (!allowMigration) {
    throw new Error("PARALLEL_SHARD_STATE_MISSING: explicit legacy bootstrap required");
  }
  const migrated = splitIngestionState(state, index, count);
  await writeIngestionState(migrated, path);
  console.log("PASS: legacy checkpoint migrated offline into shard " + index);
}
