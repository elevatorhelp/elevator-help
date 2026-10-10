export type FetchLike = typeof fetch;

export class GeminiCallBudgetExceededError extends Error {
  readonly limit: number;
  readonly used: number;

  constructor(limit: number, used: number) {
    super(`GEMINI_CALL_BUDGET_EXCEEDED_${used}_OF_${limit}`);
    this.name = "GeminiCallBudgetExceededError";
    this.limit = limit;
    this.used = used;
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isGeminiRequest(input: Parameters<FetchLike>[0]) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(url).hostname === "generativelanguage.googleapis.com";
}

export function geminiCallsPerQuestion(value?: unknown) {
  return Math.min(8, positiveInteger(value, 5));
}

export function createGeminiCallBudget(
  limitValue?: unknown,
  fetchImpl: FetchLike = fetch,
) {
  const limit = geminiCallsPerQuestion(limitValue);
  let used = 0;

  const withReserve = (reservedCalls: number): FetchLike => async (input, init) => {
    if (isGeminiRequest(input)) {
      const reserve = Math.max(0, Math.min(limit, Math.floor(reservedCalls)));
      if (used >= limit - reserve) {
        throw new GeminiCallBudgetExceededError(limit, used);
      }
      used += 1;
    }
    return fetchImpl(input, init);
  };

  const budgetedFetch = withReserve(0);

  return {
    fetch: budgetedFetch,
    fetchWithReserve: withReserve,
    snapshot: () => ({ limit, used, remaining: Math.max(0, limit - used) }),
  };
}

export async function allowAskRequest(env: any, requesterKey: string) {
  const limiter = env?.GEMINI_ASK_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return true;
  const result = await limiter.limit({ key: `gemini-api-ask:${requesterKey}` });
  return result?.success !== false;
}
