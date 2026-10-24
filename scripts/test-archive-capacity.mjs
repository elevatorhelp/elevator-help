import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateArchiveCapacity } from "./archive-capacity.mjs";

test("Issue #50 snapshot yields a lower bound, never a delivery promise", () => {
  const result = estimateArchiveCapacity({
    evidence: 142, raw: 194, map: 194, runsPerDay: 4, maxFiles: 2, targetDays: 17
  });
  assert.equal(result.pendingPhaseOperations, 530);
  assert.equal(result.nominalDailyCapacity, 8);
  assert.equal(result.optimisticLowerBoundDays, 66.25);
  assert.equal(result.minimumFilesPerRunForTarget, 8);
  assert.ok(result.assumptions.some((line) => /partial/.test(line)));
});

test("tripling workers alone does not change a file throughput cap", () => {
  const initial = estimateArchiveCapacity({
    evidence: 142, raw: 194, map: 194, runsPerDay: 4, maxFiles: 2
  });
  const increasedLimit = estimateArchiveCapacity({
    evidence: 142, raw: 194, map: 194, runsPerDay: 4, maxFiles: 8
  });
  assert.equal(initial.optimisticLowerBoundDays, 66.25);
  assert.equal(increasedLimit.optimisticLowerBoundDays, 16.5625);
});

test("no backlog gives zero, with finite throughput", () => {
  const r = estimateArchiveCapacity({ evidence: 0, raw: 0, map: 0, runsPerDay: 4, maxFiles: 2 });
  assert.equal(r.optimisticLowerBoundDays, 0);
  assert.equal(r.minimumFilesPerRunForTarget, null);
});

test("rejects invalid, fractional and unsafe capacity inputs", () => {
  const base = { evidence: 1, raw: 2, map: 3, runsPerDay: 4, maxFiles: 2 };
  for (const bad of [{maxFiles:0},{raw:-1},{map:1.5},{runsPerDay:Infinity},{evidence:Number.MAX_SAFE_INTEGER},{targetDays:0}]) {
    assert.throws(() => estimateArchiveCapacity({...base,...bad}));
  }
});
