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
console.log("Admin active-users aggregation mock tests PASS.");
