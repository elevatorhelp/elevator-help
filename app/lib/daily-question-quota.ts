export type DailyQuotaReservation = {
  subject: string;
  day: string;
  limit: number;
  used: number;
  remaining: number;
};

type QuotaResult =
  | { status: "disabled" }
  | { status: "authentication_required" }
  | { status: "limit_reached"; limit: number; remaining: 0 }
  | { status: "reserved"; reservation: DailyQuotaReservation };

function enabled(value: unknown) {
  return String(value ?? "").toLowerCase() === "true";
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function dailyQuestionLimit(env: any) {
  return Math.min(
    100,
    positiveInteger(
      env?.DAILY_QUESTION_LIMIT ?? process.env.DAILY_QUESTION_LIMIT,
      10,
    ),
  );
}

export function berlinCalendarDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function reserveDailyQuestion(
  env: any,
  userId: string | null,
  now = new Date(),
): Promise<QuotaResult> {
  const quotaEnabled = enabled(
    env?.DAILY_QUESTION_LIMIT_ENABLED ??
      process.env.DAILY_QUESTION_LIMIT_ENABLED,
  );
  if (!quotaEnabled) return { status: "disabled" };
  if (!userId) return { status: "authentication_required" };

  const database = env?.CORTEX_DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("DAILY_QUOTA_DATABASE_NOT_CONFIGURED");
  }
  const limit = dailyQuestionLimit(env);
  const day = berlinCalendarDay(now);
  const subject = `user:${userId}`;
  const row = await database
    .prepare(
      `INSERT INTO daily_question_usage (subject_key, usage_day, used, updated_at)
       VALUES (?, ?, 1, unixepoch())
       ON CONFLICT(subject_key, usage_day) DO UPDATE SET
         used = daily_question_usage.used + 1,
         updated_at = unixepoch()
       WHERE daily_question_usage.used < ?
       RETURNING used`,
    )
    .bind(subject, day, limit)
    .first();

  if (!row || !Number.isFinite(Number(row.used))) {
    return { status: "limit_reached", limit, remaining: 0 };
  }
  const used = Number(row.used);
  return {
    status: "reserved",
    reservation: {
      subject,
      day,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    },
  };
}

export async function releaseDailyQuestion(
  env: any,
  reservation: DailyQuotaReservation,
) {
  const database = env?.CORTEX_DB;
  if (!database || typeof database.prepare !== "function") return;
  await database
    .prepare(
      `UPDATE daily_question_usage
       SET used = MAX(used - 1, 0), updated_at = unixepoch()
       WHERE subject_key = ? AND usage_day = ?`,
    )
    .bind(reservation.subject, reservation.day)
    .run();
}
