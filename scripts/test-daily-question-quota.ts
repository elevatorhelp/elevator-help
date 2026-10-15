import assert from "node:assert/strict";
import {
  berlinCalendarDay,
  dailyQuestionLimit,
  releaseDailyQuestion,
  reserveDailyQuestion,
} from "../app/lib/daily-question-quota.ts";

class FakeStatement {
  private database: FakeDatabase;
  private sql: string;
  private values: unknown[];
  constructor(database: FakeDatabase, sql: string, values: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async first() {
    const [subject, day, limit] = this.values as [string, string, number];
    const key = `${subject}|${day}`;
    const current = this.database.rows.get(key) || 0;
    if (current >= limit) return null;
    const used = current + 1;
    this.database.rows.set(key, used);
    return { used };
  }
  async run() {
    assert.match(this.sql, /used = MAX\(used - 1, 0\)/);
    const [subject, day] = this.values as [string, string];
    const key = `${subject}|${day}`;
    this.database.rows.set(key, Math.max(0, (this.database.rows.get(key) || 0) - 1));
    return { success: true };
  }
}

class FakeDatabase {
  rows = new Map<string, number>();
  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

assert.equal(
  berlinCalendarDay(new Date("2026-03-29T22:30:00.000Z")),
  "2026-03-30",
  "Quota day must follow Europe/Berlin across daylight-saving time",
);
assert.equal(dailyQuestionLimit({ DAILY_QUESTION_LIMIT: "10" }), 10);

const disabled = await reserveDailyQuestion({}, "u1");
assert.equal(disabled.status, "disabled");
const anonymous = await reserveDailyQuestion(
  { DAILY_QUESTION_LIMIT_ENABLED: "true", CORTEX_DB: new FakeDatabase() },
  null,
);
assert.equal(anonymous.status, "authentication_required");

const database = new FakeDatabase();
const env = {
  DAILY_QUESTION_LIMIT_ENABLED: "true",
  DAILY_QUESTION_LIMIT: "2",
  CORTEX_DB: database,
};
const first = await reserveDailyQuestion(env, "u1");
const second = await reserveDailyQuestion(env, "u1");
const blocked = await reserveDailyQuestion(env, "u1");
assert.equal(first.status, "reserved");
assert.equal(second.status, "reserved");
assert.deepEqual(blocked, { status: "limit_reached", limit: 2, remaining: 0 });
if (second.status === "reserved") await releaseDailyQuestion(env, second.reservation);
const afterFailure = await reserveDailyQuestion(env, "u1");
assert.equal(afterFailure.status, "reserved", "Failed answers must restore quota");

console.log("PASS: authenticated daily quota reserves atomically and releases failures");
