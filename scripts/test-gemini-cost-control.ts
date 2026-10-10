import {
  allowAskRequest,
  createGeminiCallBudget,
  GeminiCallBudgetExceededError,
  geminiCallsPerQuestion,
} from "../app/lib/gemini-cost-control.ts";

let networkCalls = 0;
const fakeFetch = (async () => {
  networkCalls += 1;
  return new Response("{}", { status: 200 });
}) as typeof fetch;

const budget = createGeminiCallBudget(2, fakeFetch);
await budget.fetch("https://example.com/health");
await budget.fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
);
await budget.fetch(
  new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/test:embedContent",
  ),
);

let blocked = false;
try {
  await budget.fetch(
    new Request(
      "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    ),
  );
} catch (error) {
  blocked = error instanceof GeminiCallBudgetExceededError;
}

if (!blocked) throw new Error("Gemini call above the request budget was not blocked");
if (networkCalls !== 3)
  throw new Error(`Expected 3 actual fetches, received ${networkCalls}`);
if (budget.snapshot().used !== 2 || budget.snapshot().remaining !== 0)
  throw new Error("Gemini budget counters are incorrect");

const reservedBudget = createGeminiCallBudget(3, fakeFetch);
const retrievalFetch = reservedBudget.fetchWithReserve(2);
await retrievalFetch(
  "https://generativelanguage.googleapis.com/v1beta/models/test:embedContent",
);
let reserveProtected = false;
try {
  await retrievalFetch(
    "https://generativelanguage.googleapis.com/v1beta/models/test:embedContent",
  );
} catch (error) {
  reserveProtected = error instanceof GeminiCallBudgetExceededError;
}
if (!reserveProtected || reservedBudget.snapshot().remaining !== 2)
  throw new Error("Reserved answer capacity was not protected");
if (geminiCallsPerQuestion("999") !== 8)
  throw new Error("Per-question budget must retain the hard safety ceiling");
if (geminiCallsPerQuestion("invalid") !== 5)
  throw new Error("Invalid budget configuration must use the safe default");

if (!(await allowAskRequest({}, "local-test")))
  throw new Error("Missing rate-limit binding must remain development-safe");
let receivedRateLimitKey = "";
if (
  await allowAskRequest(
    {
      GEMINI_ASK_RATE_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          receivedRateLimitKey = key;
          return { success: false };
        },
      },
    },
    "user-123",
  )
)
  throw new Error("Cloudflare rate-limit rejection was ignored");
if (receivedRateLimitKey !== "gemini-api-ask:user-123")
  throw new Error("Rate-limit requests must be isolated per signed-in user/IP");

console.log("PASS: Gemini per-question budget and upstream rate-limit guard");
