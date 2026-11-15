import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canRetryExistingMapWithoutGemini} from "./qa-issue106-map-retry-gate.mjs";

const selectedMap="Ingestion phase preference: raw; selected: map\n";
const selectedRaw="Ingestion phase preference: evidence; selected: raw\n";
const readbackError="V2_MAP_VECTOR_READBACK_TIMEOUT";
const pendingError="V2_MAP_PENDING_VECTOR_READBACK";
assert.equal(canRetryExistingMapWithoutGemini(1,selectedMap+readbackError),true);
assert.equal(canRetryExistingMapWithoutGemini(2,selectedMap+pendingError),true);
assert.equal(canRetryExistingMapWithoutGemini(1,
  "Ingestion phase preference: map; selected: map\n"+readbackError),true);
assert.equal(canRetryExistingMapWithoutGemini(0,selectedMap+readbackError),false);
assert.equal(canRetryExistingMapWithoutGemini(1,selectedRaw+readbackError),false);
assert.equal(canRetryExistingMapWithoutGemini(1,selectedMap+"V2_RAW_LEASE_GUARD_FAILED"),false);
assert.equal(canRetryExistingMapWithoutGemini(1,selectedMap+"Gemini key invalid"),false);
assert.equal(canRetryExistingMapWithoutGemini(1,readbackError),false);
assert.equal(canRetryExistingMapWithoutGemini(1,
  selectedMap+"V2_MAP_PENDING_INTENT_CORRUPT"),false);
const runner=readFileSync(new URL("./qa-issue106-parallel-run.sh",import.meta.url),"utf8");
const ingest=readFileSync(new URL("./drive-ingest.mjs",import.meta.url),"utf8");
assert.match(runner,/run_slot "\$slot" recover/);
assert.match(runner,/export QA106_MAP_RECOVERY_ONLY=true/);
assert.match(runner,/qa-issue106-map-retry-gate\.mjs/);
assert.match(runner,/if \[\[ ! -f "\$OVERLAP" \]\];then probe_overlap/);
assert.match(ingest,/if\(QA106_MAP_RECOVERY_ONLY\)throw Error\("QA106_MAP_RECOVERY_NEW_RAW_DENIED"\)/);
assert.match(ingest,/if\(QA106_MAP_RECOVERY_ONLY\)throw Error\("QA106_MAP_RECOVERY_NEW_MAP_DENIED"\)/);
assert.match(ingest,/if\(QA106_MAP_RECOVERY_ONLY && plan\.phase!=="map"\)/);
assert.match(ingest,/if\(QA106_MAP_RECOVERY_ONLY && previous\.status==="none"\)/);
console.log("PASS: Issue106 true Map phase is recoverable in any round; recovery retries categorically forbid paid regeneration");
