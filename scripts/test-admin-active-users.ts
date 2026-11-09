import assert from "node:assert/strict";
import { readActiveQuestionUsers } from "../app/lib/admin-active-question-users.ts";
const now = new Date("2026-11-07T20:00:00Z");
let sql = "", args: string[] = [];
const db = { prepare(query: string) {
  sql = query;
  return { bind(...a: string[]) {
    args = a;
    return { first: async () => ({dau: 5, mau: 19, questions_today: 24}) };
  } };
} };
const count = await readActiveQuestionUsers(db, now);
assert.equal(count?.dau, 5);
assert.equal(count?.mau30d, 19);
assert.equal(count?.questionsToday, 24);
assert.equal(count?.observationDay, "2026-11-07");
assert.deepEqual(args, ["2026-11-07","2026-11-07","2026-10-09","2026-11-07"]);
assert.ok(sql.includes("COUNT(DISTINCT"));
assert.ok(sql.includes("used > 0"));
assert.ok(sql.includes("subject_key LIKE 'user:%'"));
assert.equal(await readActiveQuestionUsers(null,now),null);
assert.equal(await readActiveQuestionUsers({prepare:()=>({bind:()=>({first:async()=>{throw Error("D1 unavailable")}})})},now),null);
assert.equal(await readActiveQuestionUsers({prepare:()=>({bind:()=>({first:async()=>({dau:8,mau:1,questions_today:3})})})},now),null);

 
// Both read-only D1 metrics must remain independent when one source fails.
const { readPublishedEvidenceInventory } = await import("../app/lib/admin-archive-inventory.ts");
async function isolatedMetrics(fail: "archive" | "usage") {
  const sharedDb = {
    prepare(query: string) {
      if (query.includes("FROM archive_chunks")) {
        return { first: async () => {
          if (fail === "archive") throw Error("archive table unavailable");
          return { indexed_files: 12, evidence_chunks: 30 };
        } };
      }
      if (query.includes("FROM daily_question_usage")) {
        return { bind: (..._args: string[]) => ({ first: async () => {
          if (fail === "usage") throw Error("usage table unavailable");
          return { dau: 5, mau: 19, questions_today: 24 };
        } }) };
      }
      throw Error("unexpected SQL");
    },
  };
  return Promise.all([
    readPublishedEvidenceInventory(sharedDb as Parameters<typeof readPublishedEvidenceInventory>[0]).catch(() => null),
    readActiveQuestionUsers(sharedDb as Parameters<typeof readActiveQuestionUsers>[0], now).catch(() => null),
  ]);
}
const [archiveDown, usageStillValid] = await isolatedMetrics("archive");
assert.equal(archiveDown, null);
assert.equal(usageStillValid?.dau, 5);
const [archiveStillValid, usageDown] = await isolatedMetrics("usage");
assert.equal(archiveStillValid?.indexedEvidenceFiles, 12);
assert.equal(usageDown, null);

console.log("Admin active-users and independent D1 source failure mock tests PASS.");
