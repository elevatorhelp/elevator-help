import { berlinCalendarDay } from "./daily-question-quota.ts";

export type ActiveQuestionUsers = {
  dau: number;
  mau30d: number;
  questionsToday: number;
  observationDay: string;
  source: "D1.daily_question_usage";
  definition: string;
};

type D1 = { prepare: (query: string) => { bind: (...args: string[]) => { first: () => Promise<Record<string, unknown> | null> } } };
function nonnegativeInt(x: unknown): number | null {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : null;
}
export async function readActiveQuestionUsers(db: D1 | null | undefined, now = new Date()): Promise<ActiveQuestionUsers | null> {
  if (!db) return null;
  const day = berlinCalendarDay(now);
  const start = new Date(day + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - 29);
  const first = start.toISOString().slice(0, 10);
  try {
    const row = await db.prepare(`
      SELECT COUNT(DISTINCT CASE WHEN usage_day = ? AND used > 0 THEN subject_key END) AS dau,
             COUNT(DISTINCT CASE WHEN used > 0 THEN subject_key END) AS mau,
             COALESCE(SUM(CASE WHEN usage_day = ? AND used > 0 THEN used ELSE 0 END),0) AS questions_today
      FROM daily_question_usage
      WHERE usage_day BETWEEN ? AND ? AND subject_key LIKE 'user:%'`)
      .bind(day, day, first, day).first();
    const dau = nonnegativeInt(row?.dau);
    const mau30d = nonnegativeInt(row?.mau);
    const questionsToday = nonnegativeInt(row?.questions_today);
    if (dau === null || mau30d === null || questionsToday === null || dau > mau30d) return null;
    return {
      dau, mau30d, questionsToday, observationDay: day,
      source: "D1.daily_question_usage",
      definition: "Distinct signed-in subjects who successfully reserved at least one daily question over the given Berlin calendar day or trailing 30 days. Does not count passive site visitors.",
    };
  } catch { return null; }
}
