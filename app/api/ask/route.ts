import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";
import {
  answerStandardsQuestion,
  isStandardsQuestion,
} from "../../lib/cortex-standards-engine";
import {
  retrieveInternalEvidence,
  shouldTryInternalRetrieval,
} from "../../lib/internal-retrieval";
import { requiresStandardSafetyCheck } from "../../lib/query-policy";
import { multilingualRetrievalFromEnv } from "../../lib/retrieval-backend";
import { addWebSourceLabel } from "../../lib/source-label";
import { authorizeChatRequest } from "../../lib/request-auth";
import {
  allowAskRequest,
  createGeminiCallBudget,
  type FetchLike,
} from "../../lib/gemini-cost-control";
import {
  domainIdentityPrompt,
  protectedClaimsPrompt,
} from "../../lib/domain-pack";
import { shouldUsePublicWebFallback } from "../../lib/cortex-evidence-policy";
import {
  releaseDailyQuestion,
  reserveDailyQuestion,
  type DailyQuotaReservation,
} from "../../lib/daily-question-quota";
import {
  recordWebResearchCandidate,
  type WebResearchTrace,
} from "../../lib/cortex-learning";
import {
  asksResponseProvenance,
  canonicalManufacturer,
  extractFaultCode,
  historyEvidenceLabel,
  isBareFaultCodeQuestion,
  manufacturerClarificationQuestion,
  resolveManufacturerClarification,
} from "../../lib/fault-context";

const MODEL = "gemini-3.6-flash";
type HistoryItem = {
  role?: string;
  content?: string;
  text?: string;
  mode?: string;
};

class GeminiDirectError extends Error {
  providerStatus?: string;
  providerMessage?: string;
  constructor(
    httpStatus: number,
    providerStatus?: string,
    providerMessage?: string,
  ) {
    super(`GEMINI_DIRECT_HTTP_${httpStatus}`);
    this.name = "GeminiDirectError";
    this.providerStatus = providerStatus;
    this.providerMessage = providerMessage;
  }
}
function normalizeHistory(v: unknown): HistoryItem[] {
  return Array.isArray(v)
    ? v.slice(-10).filter((x: any) => x && typeof x === "object")
    : [];
}
function historyText(h: HistoryItem[]) {
  return h
    .map((i) => {
      const r =
        i.role === "assistant" || i.role === "model" ? "Assistant" : "User";
      const t =
        typeof i.content === "string"
          ? i.content
          : typeof i.text === "string"
            ? i.text
            : "";
      const evidence =
        i.role === "assistant" ? historyEvidenceLabel(i.mode) : null;
      return t.trim()
        ? `${r}${evidence ? ` [response provenance: ${evidence}]` : ""}: ${t.trim()}`
        : "";
    })
    .filter(Boolean)
    .join("\n");
}
function basePrompt(q: string, h: HistoryItem[], unverified = false) {
  return `${domainIdentityPrompt()}\nPRIMARY BEHAVIOR:\n- Understand natural, misspelled, incomplete, shorthand and mixed-language input.\n- Reply naturally in the language the user is using now. Preserve technical identifiers, manufacturer names and fault codes.\n- Maintain conversational context when relevant. Ordinary conversation works directly without retrieval.\n- Never expose internal filenames, storage locations, archive/Drive links or implementation details.\nTECHNICAL SAFETY / EVIDENCE:\n- Never invent any protected claim (${protectedClaimsPrompt()}).\n- If an exact source-specific or normative fact cannot be verified from evidence supplied by the application, say that the exact point cannot currently be verified.\n- Do not pretend retrieval succeeded when it did not.\n- When asked where a previous answer came from, use only the explicit response-provenance marker in RECENT CONVERSATION. If no marker is present, say that its provenance cannot be determined; never claim that manuals or internal documents were checked merely from your general knowledge.\n${unverified ? "- A specialist retrieval tool failed or returned no verified evidence for this turn. Do not present the requested specialist fact as verified or claim that manuals, catalogs, an internal library, or the web were checked." : ""}\nRECENT CONVERSATION:\n${historyText(h) || "(none)"}\nCURRENT USER MESSAGE:\n${q}\nReturn only the answer to the user.`;
}
type GeminiCallResult = {
  text: string;
  webResearch: WebResearchTrace;
};

async function callGeminiResult(
  prompt: string,
  key: string,
  useWeb = false,
  fetchImpl: FetchLike = fetch,
) {
  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 3000 },
  };
  if (useWeb) body.tools = [{ google_search: {} }];
  const r = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!r.ok) {
    let s = "",
      m = "";
    try {
      const e: any = await r.json();
      s = typeof e?.error?.status === "string" ? e.error.status : "";
      m =
        typeof e?.error?.message === "string"
          ? e.error.message.slice(0, 500)
          : "";
    } catch {}
    console.error(
      useWeb ? "Gemini web request failed" : "Gemini direct request failed",
      { httpStatus: r.status, providerStatus: s, providerMessage: m },
    );
    throw new GeminiDirectError(r.status, s, m);
  }
  const d: any = await r.json();
  const a = d?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text || "")
    .join("")
    .trim();
  if (!a) throw new Error(useWeb ? "GEMINI_WEB_EMPTY" : "GEMINI_DIRECT_EMPTY");
  const u = d?.usageMetadata || {};
  console.info(useWeb ? "Gemini web usage" : "Gemini direct usage", {
    model: MODEL,
    promptTokenCount: Number(u.promptTokenCount || 0),
    candidatesTokenCount: Number(u.candidatesTokenCount || 0),
    thoughtsTokenCount: Number(u.thoughtsTokenCount || 0),
    totalTokenCount: Number(u.totalTokenCount || 0),
    promptChars: prompt.length,
    answerChars: a.length,
  });
  const grounding = d?.candidates?.[0]?.groundingMetadata || {};
  const queries = Array.isArray(grounding?.webSearchQueries)
    ? grounding.webSearchQueries.filter(
        (item: unknown): item is string => typeof item === "string",
      )
    : [];
  const sources = Array.isArray(grounding?.groundingChunks)
    ? grounding.groundingChunks
        .map((chunk: any) => chunk?.web)
        .filter((web: any) => typeof web?.uri === "string")
        .map((web: any) => ({
          uri: web.uri as string,
          title: typeof web.title === "string" ? web.title : null,
        }))
    : [];
  return { text: a, webResearch: { queries, sources } };
}

async function callGemini(
  prompt: string,
  key: string,
  useWeb = false,
  fetchImpl: FetchLike = fetch,
) {
  return (await callGeminiResult(prompt, key, useWeb, fetchImpl)).text;
}
const answerDirect = (
  q: string,
  k: string,
  h: HistoryItem[] = [],
  u = false,
  fetchImpl: FetchLike = fetch,
) => callGemini(basePrompt(q, h, u), k, false, fetchImpl);
function needsPublicWeb(q: string) {
  const current =
    /\b(latest|current|today|online|web|internet|website|newest|aktuell|heute|online|webseite|internet)\b/i.test(
      q,
    ) || /(جدیدترین|فعلی|امروز|آنلاین|اینترنت|وب)/i.test(q);
  const docs =
    /\b(manual|datasheet|data\s*sheet|catalog(?:ue)?|handbuch|datenblatt|katalog|betriebsanleitung)\b/i.test(
      q,
    ) || /(دفترچه|کاتالوگ|دیتاشیت|راهنما)/i.test(q);
  const fault = /\b(?:fehler|fault|error|code)\s*[A-Z-]*\d{1,4}\b/i.test(q);
  const maker =
    /\b(Schindler|KONE|Otis|TKE|ThyssenKrupp|NEW\s*LIFT|Ziehl[-\s]*Abegg|Weber)\b/i.test(
      q,
    );
  return current || docs || (maker && fault);
}
function sanitizeUserAnswer(answer: string) {
  const t = answer.trim();
  const leak =
    t.toLowerCase().includes("context: no exact unverified tool data") ||
    t.toLowerCase().includes("language: german") ||
    t.toLowerCase().includes("verified internal evidence:") ||
    t.toLowerCase().includes("retrieved internal source evidence:") ||
    t.toLowerCase().includes("public web mode:") ||
    t.toLowerCase().includes("primary behavior:") ||
    t.toLowerCase().includes("current user message:");
  return leak ? "" : t;
}
function isObviouslyIncomplete(answer: string) {
  const t = answer.trim();
  if (!t) return true;
  return (
    /(?:\bbzw\.|\bz\.\s*b\.|\bor\s+|\band\s+|\boder\s+|\bund\s+|\bzu\s+ver\w*)$/i.test(
      t,
    ) ||
    /[,:;\-–—]$/.test(t) ||
    /\b(?:die bezeichnung steht für|folgende faktoren|zum beispiel|beispielsweise)\s*:?$/i.test(
      t,
    )
  );
}
async function safeDirectAnswer(
  q: string,
  k: string,
  h: HistoryItem[] = [],
  u = false,
  fetchImpl: FetchLike = fetch,
) {
  const first = sanitizeUserAnswer(
    await answerDirect(q, k, h, u, fetchImpl),
  );
  if (first && !isObviouslyIncomplete(first)) return first;
  if (first)
    console.error(
      "Gemini direct answer appears truncated; retrying once for a complete answer",
    );
  console.error(
    "Suppressed internal prompt/metadata leakage from Gemini answer",
  );
  const retryPrompt = `${basePrompt(q, h, u)}\n\nRETRY INSTRUCTION:\nReturn a complete user-facing answer. Do not output instructions, metadata, context labels, analysis notes, prompt text, or private implementation details. Preserve the conversation context and the evidence/verification limits above.`;
  const retry = await callGemini(retryPrompt, k, false, fetchImpl);
  const clean = sanitizeUserAnswer(retry);
  if (!clean || isObviouslyIncomplete(clean))
    throw new Error("GEMINI_OUTPUT_UNSAFE");
  return clean;
}
async function safeWebAnswer(
  prompt: string,
  key: string,
  language?: string | null,
  fetchImpl: FetchLike = fetch,
) {
  const result = await callGeminiResult(prompt, key, true, fetchImpl);
  const clean = sanitizeUserAnswer(
    result.text,
  );
  if (!clean || isObviouslyIncomplete(clean))
    throw new Error("GEMINI_WEB_OUTPUT_UNSAFE");
  return {
    answer: addWebSourceLabel(clean, language),
    webResearch: result.webResearch,
  };
}
type GroundedAnswer = {
  answer: string;
  evidence: { index: number; quote: string }[];
};
function parseGroundedAnswer(
  raw: string,
  evidence: { id: string; text: string }[],
  question: string,
): GroundedAnswer | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch {
    return null;
  }
  const answer =
    typeof parsed?.answer === "string" ? sanitizeUserAnswer(parsed.answer) : "";
  if (
    !answer ||
    isObviouslyIncomplete(answer) ||
    !Array.isArray(parsed?.evidence) ||
    !parsed.evidence.length
  )
    return null;
  const citations: GroundedAnswer["evidence"] = [];
  for (const item of parsed.evidence) {
    const index = item?.index;
    const quote = typeof item?.quote === "string" ? item.quote.trim() : "";
    const normalizedQuote = quote.replace(/\s+/g, " ").trim();
    const normalizedSource =
      evidence[index - 1]?.text.replace(/\s+/g, " ").trim() || "";
    if (
      !Number.isInteger(index) ||
      index < 1 ||
      index > evidence.length ||
      normalizedQuote.length < 12 ||
      !normalizedSource.includes(normalizedQuote)
    )
      return null;
    citations.push({ index, quote: normalizedQuote });
  }
  const faultCode = extractFaultCode(question);
  if (
    faultCode &&
    !citations.some(({ quote }) =>
      quote.toLowerCase().includes(faultCode.toLowerCase()),
    )
  )
    return null;
  return { answer, evidence: citations };
}
function safeError(q: string) {
  if (/[؀-ۿ]/.test(q))
    return "الان ارتباط مستقیم با هوش مصنوعی برقرار نشد. لطفاً همین پیام را یک بار دیگر بفرست.";
  if (/\b(du|dich|was|wie|wer|aufzug|fehler|schacht)\b/i.test(q))
    return "Die direkte KI-Verbindung hat gerade nicht geantwortet. Bitte sende dieselbe Nachricht noch einmal.";
  return "The direct AI connection did not respond just now. Please send the same message once more.";
}

function dailyQuotaError(q: string, limit: number) {
  if (/[؀-ۿ]/.test(q))
    return `سهمیهٔ ${limit} سؤال امروزت تمام شده است. فردا دوباره می‌توانی سؤال بپرسی.`;
  if (/\b(du|dich|was|wie|wer|aufzug|fehler|schacht)\b/i.test(q))
    return `Deine ${limit} Fragen für heute sind aufgebraucht. Morgen kannst du wieder fragen.`;
  if (/[¿¡]|\b(?:qué|cuál|cómo|código)\b/i.test(q))
    return `Has usado tus ${limit} preguntas de hoy. Podrás volver a preguntar mañana.`;
  return `Your ${limit} questions for today have been used. Please try again tomorrow.`;
}

async function retrieveFaultEvidenceWithoutGemini(question: string) {
  const faultCode = extractFaultCode(question);
  const manufacturer = canonicalManufacturer(question);
  if (!faultCode || !manufacturer) return null;
  const route: any = {
    intent: "troubleshooting",
    evidenceNeed: "internal",
    questionLanguage: "de",
    preferredSourceLanguage: "de",
    manufacturer,
    productFamily: null,
    controller: null,
    faultCode,
    faultFamily: null,
    faultName: null,
    topics: [],
    components: [],
    confidence: "high",
    needsClarification: false,
    clarificationQuestion: null,
    searchStrategy: "filtered",
    normalizedQuestion: question,
    interpretation: null,
  };
  const { env } = getCloudflareContext();
  const evidence = await retrieveInternalEvidence(
    question,
    route,
    (env as any).AI,
    (env as any).VECTORIZE,
    undefined,
    (env as any).CORTEX_DB,
  );
  const exact = evidence.find(
    (item) =>
      String(item.faultCode || "").toUpperCase() === faultCode ||
      item.text.toUpperCase().includes(faultCode),
  );
  return exact?.text || null;
}

export async function POST(request: NextRequest) {
  let question = "";
  let geminiBudget: ReturnType<typeof createGeminiCallBudget> | null = null;
  let runtimeEnv: any = null;
  let quotaReservation: DailyQuotaReservation | null = null;
  let successfulAnswerDelivered = false;
  const answerJson = (payload: Record<string, unknown>, counts = true) => {
    if (counts) successfulAnswerDelivered = true;
    return NextResponse.json({
      ...payload,
      ...(counts && quotaReservation
        ? {
            dailyQuestions: {
              limit: quotaReservation.limit,
              remaining: quotaReservation.remaining,
            },
          }
        : {}),
    });
  };
  const rememberWebResearch = async (trace: WebResearchTrace) => {
    if (!runtimeEnv) return;
    try {
      await recordWebResearchCandidate(runtimeEnv, trace);
    } catch (error) {
      console.error("Web learning candidate could not be recorded", error);
    }
  };
  try {
    const authorization = await authorizeChatRequest(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status },
      );
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 64_000) {
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    }
    const body: any = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question)
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 },
      );
    if (question.length > 8_000)
      return NextResponse.json(
        { error: "Question is too long." },
        { status: 413 },
      );
    const history = normalizeHistory(
      body?.history ?? body?.messages ?? body?.conversation,
    );
    const { env } = getCloudflareContext();
    runtimeEnv = env;
    const requesterKey =
      authorization.userId ||
      request.headers.get("cf-connecting-ip") ||
      "anonymous";
    if (!(await allowAskRequest(env, requesterKey))) {
      return NextResponse.json(
        { error: safeError(question), diagnosticCode: "ASK_RATE_LIMITED" },
        { status: 429 },
      );
    }
    const quota = await reserveDailyQuestion(
      env,
      authorization.userId,
    );
    if (quota.status === "authentication_required") {
      return NextResponse.json(
        {
          error: "Please sign in to use your daily question allowance.",
          diagnosticCode: "DAILY_QUOTA_AUTH_REQUIRED",
        },
        { status: 401 },
      );
    }
    if (quota.status === "limit_reached") {
      return NextResponse.json(
        {
          error: dailyQuotaError(question, quota.limit),
          diagnosticCode: "DAILY_QUESTION_LIMIT_REACHED",
          dailyQuestions: { limit: quota.limit, remaining: 0 },
        },
        { status: 429 },
      );
    }
    if (quota.status === "reserved") quotaReservation = quota.reservation;
    geminiBudget = createGeminiCallBudget(
      (env as any).GEMINI_MAX_CALLS_PER_QUESTION ??
        process.env.GEMINI_MAX_CALLS_PER_QUESTION,
    );
    const geminiFetch = geminiBudget.fetch;
    const routerFetch = geminiBudget.fetchWithReserve(4);
    const retrievalFetch = geminiBudget.fetchWithReserve(2);
    question = resolveManufacturerClarification(question, history) || question;
    if (isBareFaultCodeQuestion(question))
      return answerJson({
        answer: manufacturerClarificationQuestion(question),
        sources: [],
        mode: "clarification",
      }, false);
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      try {
        const evidence = await retrieveFaultEvidenceWithoutGemini(question);
        if (evidence)
          return answerJson({
            answer: evidence,
            sources: [],
            mode: "internal_evidence",
          });
      } catch (e) {
        console.error("Preview internal retrieval unavailable:", e);
      }
      return NextResponse.json(
        { error: "AI is not configured." },
        { status: 500 },
      );
    }
    if (asksResponseProvenance(question))
      return answerJson({
        answer: await safeDirectAnswer(
          question,
          key,
          history,
          false,
          geminiFetch,
        ),
        sources: [],
        mode: "provenance_answer",
      });
    let preRoutedRoute: any = null;
    try {
      preRoutedRoute = await routeQuestion(question, history, routerFetch);
    } catch (e) {
      console.error("Semantic routing unavailable:", e);
    }
    let preRoutedEffective = preRoutedRoute?.normalizedQuestion || question;
    if (
      preRoutedRoute?.needsClarification &&
      preRoutedRoute?.clarificationQuestion
    )
      return answerJson({
        answer: preRoutedRoute.clarificationQuestion,
        sources: [],
        mode: "clarification",
      }, false);
    if (
      requiresStandardSafetyCheck(question) ||
      preRoutedRoute?.intent === "standard" ||
      preRoutedRoute?.evidenceNeed === "standard"
    ) {
      let route: any = preRoutedRoute;
      const effective = route?.normalizedQuestion || question;
      if (!route)
        return answerJson({
          answer: await safeDirectAnswer(
            effective,
            key,
            history,
            true,
            geminiFetch,
          ),
          sources: [],
          mode: "gemini_direct_unverified",
        });
      if (
        route?.intent === "standard" &&
        isStandardsQuestion(effective, route)
      ) {
        try {
          const { env } = getCloudflareContext();
          const result = await answerStandardsQuestion(
            effective,
            route,
            key,
            (env as any).AI,
            (env as any).VECTORIZE,
            multilingualRetrievalFromEnv(env, key, retrievalFetch),
            geminiFetch,
            retrievalFetch,
            (env as any).CORTEX_DB,
          );
          if (result.sufficient)
            return answerJson({
              answer: result.answer,
              sources: [],
              mode: "standards_verified",
              standardsChecked: result.checkedStandards,
            });
          const p = `${basePrompt(effective, history, false)}\n\nSTANDARD WEB FALLBACK:\n- First form the best technical candidate answer from your elevator knowledge. Then use Google Search to verify the exact normative claim against credible public sources.\n- Do not mention any internal library, archive, retrieval, index, database, missing document, or search mechanics.\n- If public evidence supports the exact claim, answer naturally and append exactly: Web-based\n- If public evidence is insufficient or conflicting, give the likely answer only as explicitly uncertain, say that sufficient evidence was not found to confirm it, and append exactly: Web-based\n- Never turn an unverified normative number into a certain fact.\n- Reply in the user's language.`;
          const web = await safeWebAnswer(
            p,
            key,
            route?.questionLanguage,
            geminiFetch,
          );
          await rememberWebResearch(web.webResearch);
          return answerJson({
            answer: web.answer,
            sources: [],
            mode: "standards_web_fallback",
            standardsChecked: result.checkedStandards,
          });
        } catch (e) {
          console.error(
            "Standards verification unavailable; using web fallback:",
            e,
          );
          const p = `${basePrompt(effective, history, false)}\n\nSTANDARD WEB FALLBACK:\n- Give your best technical candidate, then use Google Search to verify the exact normative claim.\n- Do not mention internal systems or search mechanics.\n- If verified, answer naturally and append exactly: Web-based\n- If not sufficiently verified, state the likely answer as uncertain and say sufficient evidence was not found, then append exactly: Web-based\n- Reply in the user's language.`;
          const web = await safeWebAnswer(
            p,
            key,
            route?.questionLanguage,
            geminiFetch,
          );
          await rememberWebResearch(web.webResearch);
          return answerJson({
            answer: web.answer,
            sources: [],
            mode: "standards_web_fallback",
          });
        }
      }
      preRoutedRoute = route;
      preRoutedEffective = effective;
    }

    if (preRoutedRoute) {
      let route: any = preRoutedRoute;
      const effective = route.normalizedQuestion || preRoutedEffective;
      if (route?.needsClarification && route?.clarificationQuestion)
        return answerJson({
          answer: route.clarificationQuestion,
          sources: [],
          mode: "clarification",
        }, false);
      const mustVerify =
        requiresStandardSafetyCheck(question) ||
        requiresStandardSafetyCheck(effective) ||
        route?.evidenceNeed === "standard" ||
        route?.intent === "standard";
      let verifiedStandardClaims: any[] = [];
      let standardsVerificationUnavailable = false;
      if (mustVerify && route) {
        try {
          const { env } = getCloudflareContext();
          const result = await answerStandardsQuestion(
            effective,
            route,
            key,
            (env as any).AI,
            (env as any).VECTORIZE,
            multilingualRetrievalFromEnv(env, key, retrievalFetch),
            geminiFetch,
            retrievalFetch,
            (env as any).CORTEX_DB,
          );
          if (route?.intent === "standard") {
            if (result.sufficient)
              return answerJson({
                answer: result.answer,
                sources: [],
                mode: "standards_verified",
                standardsChecked: result.checkedStandards,
              });
            const p = `${basePrompt(effective, history, false)}\n\nSTANDARD WEB FALLBACK:\n- First form the best technical candidate answer, then use Google Search to verify the exact normative claim.\n- Never mention internal library/archive/retrieval/index mechanics.\n- If verified, answer naturally. If not, mark the likely answer explicitly uncertain and say sufficient evidence was not found.\n- Append exactly: Web-based\n- Reply in the user's language.`;
            const web = await safeWebAnswer(
              p,
              key,
              route?.questionLanguage,
              geminiFetch,
            );
            await rememberWebResearch(web.webResearch);
            return answerJson({
              answer: web.answer,
              sources: [],
              mode: "standards_web_fallback",
              standardsChecked: result.checkedStandards,
            });
          }
          verifiedStandardClaims = Array.isArray(result.verifiedClaims)
            ? result.verifiedClaims
            : [];
          standardsVerificationUnavailable = !result.sufficient;
        } catch (e) {
          standardsVerificationUnavailable = true;
          console.error(
            "Resolved standards tool unavailable; preserving conversation:",
            e,
          );
        }
      }
      const wantsInternal =
        route?.evidenceNeed === "internal" ||
        (route && shouldTryInternalRetrieval(route));
      let internalEvidenceAttemptedButUnavailable = false;
      if (wantsInternal) {
        try {
          const { env } = getCloudflareContext();
          const evidence = await retrieveInternalEvidence(
            effective,
            route,
            (env as any).AI,
            (env as any).VECTORIZE,
            multilingualRetrievalFromEnv(env, key, retrievalFetch),
            (env as any).CORTEX_DB,
          );
          if (evidence.length) {
            const excerpts = evidence
              .map((x: any, i: number) => `Evidence ${i + 1}: ${x.text}`)
              .join("\n\n");
            const p = `${basePrompt(effective, history, false)}\n\nRETRIEVED INTERNAL SOURCE EVIDENCE:\n${excerpts}\n\nThese are raw source excerpts, not independently verified facts. Answer only claims supported by these excerpts. For each material factual claim, supply an exact supporting quote from the relevant excerpt. If the excerpts do not answer the question, return an empty answer. Exact normative/safety-critical numerical limits require the standards verifier path. A fault-code meaning or operational instruction explicitly stated in a matching manufacturer source excerpt may be answered, but attribute it naturally to the available source and do not add unsupported steps. Do not call an excerpt a manual, official documentation, or manufacturer documentation unless the excerpt itself establishes that provenance. When the question contains a fault code, at least one evidence quote MUST include the exact code plus enough surrounding source words to support the meaning. Never reveal internal files, storage, retrieval, filenames, scores or document names.\nReturn ONLY JSON: {"answer":"user-facing answer or empty string","evidence":[{"index":1,"quote":"exact verbatim substring from that evidence"}]}. Do not include quotes or indices in the user-facing answer.`;
            const raw = await callGemini(p, key, false, geminiFetch);
            const grounded = parseGroundedAnswer(raw, evidence, effective);
            if (grounded) {
              console.info("Internal answer evidence trace", {
                mode: "internal_evidence",
                evidenceIds: grounded.evidence.map(
                  (x) => evidence[x.index - 1].id,
                ),
                quoteMatched: true,
              });
              return answerJson({
                answer: grounded.answer,
                sources: [],
                mode: "internal_evidence",
              });
            }
            console.warn("Internal answer evidence trace", {
              mode: "internal_evidence_rejected",
              evidenceIds: evidence.map((x) => x.id),
              quoteMatched: false,
            });
            internalEvidenceAttemptedButUnavailable = true;
          } else {
            internalEvidenceAttemptedButUnavailable = true;
          }
        } catch (e) {
          internalEvidenceAttemptedButUnavailable = true;
          console.error(
            "Internal retrieval unavailable; falling through safely:",
            e,
          );
        }
      }
      const wantsWeb = shouldUsePublicWebFallback({
        evidenceNeed: route?.evidenceNeed,
        explicitWebRequest: needsPublicWeb(effective),
        internalEvidenceMissing: internalEvidenceAttemptedButUnavailable,
        requiredVerificationMissing: standardsVerificationUnavailable,
      });
      if (wantsWeb) {
        try {
          const p = `${basePrompt(effective, history, false)}\n\nPUBLIC WEB MODE:\n- Use Google Search grounding because current/public evidence is required or internal evidence was unavailable or insufficient. Prefer manufacturer/official primary sources. Do not expose internal retrieval mechanics, citations, or a routine source list. Public web evidence is not a substitute for deterministic standards verification. Never state normative numerical limits, standard clauses, mandatory safety values, or exact test values from public-web mode; omit the number and say the exact value requires standards verification. For manufacturer-specific model numbers, parameters, connector/pin details, or procedures, state them only when directly supported by an authoritative manufacturer primary source; otherwise do not guess or list candidate models, and say the exact manufacturer detail could not be verified. For manufacturer-specific technical information, calibrate certainty to the evidence: if authoritative manufacturer primary evidence directly supports a claim, state it normally. If public evidence supports a common/typical configuration but not the exact installation, keep the useful information but qualify it naturally (for example: typically, commonly, depending on configuration) and say the exact installed type must be verified from the unit identification or manufacturer documentation. Do not turn plausible public-web details into guaranteed facts. For safety-relevant replacement, adjustment or parameterization, add one concise caution in the user's language to verify against the applicable manufacturer documentation or manufacturer service. Omit unnecessary caution only when authoritative manufacturer evidence directly supports the exact answer. Append exactly: Web-based`;
          const web = await safeWebAnswer(
            p,
            key,
            route?.questionLanguage,
            geminiFetch,
          );
          await rememberWebResearch(web.webResearch);
          return answerJson({
            answer: web.answer,
            sources: [],
            mode: "gemini_web",
          });
        } catch (e) {
          console.error(
            "Public web unavailable or unsafe; preserving conversation:",
            e,
          );
          return answerJson({
            answer: await safeDirectAnswer(
              effective,
              key,
              history,
              true,
              geminiFetch,
            ),
            sources: [],
            mode: "gemini_direct_unverified",
          });
        }
      }
      if (verifiedStandardClaims.length) {
        const verifiedFacts = verifiedStandardClaims
          .map((x: any) => `${x.standard} ${x.clause}: ${x.text}`)
          .join("\n");
        const p = `${basePrompt(effective, history, false)}\n\nDETERMINISTICALLY VERIFIED STANDARD CLAIMS:\n${verifiedFacts}\n\nUse these verified claims as constraints/facts while answering the user's planning/design question. Preserve the planning intent. Do not add or infer any exact normative value that is not contained in these verified claims. Do not mention internal verification mechanics.`;
        return answerJson({
          answer: await callGemini(
            p +
              "\n\nReturn only a complete user-facing planning/design answer.",
            key,
            false,
            geminiFetch,
          ),
          sources: [],
          mode: "planning_with_verified_standards",
        });
      }
      return answerJson({
        answer: await safeDirectAnswer(
          effective,
          key,
          history,
          internalEvidenceAttemptedButUnavailable ||
            standardsVerificationUnavailable,
          geminiFetch,
        ),
        sources: [],
        mode:
          internalEvidenceAttemptedButUnavailable ||
          standardsVerificationUnavailable
            ? "gemini_direct_unverified"
            : "gemini_direct",
      });
    }

    if (needsPublicWeb(question)) {
      try {
        const p = `${basePrompt(question, history, false)}\n\nPUBLIC WEB MODE:\n- Use Google Search grounding because this turn explicitly needs current/online evidence. Prefer official primary sources. Do not expose a routine source list.`;
        const language = /[؀-ۿ]/.test(question)
          ? "fa"
          : /[¿¡]|\b(?:qué|cuál|cómo|código)\b/i.test(question)
            ? "es"
            : /\b(?:was|wie|fehler|aufzug|quelle)\b/i.test(question)
              ? "de"
              : "en";
        const web = await safeWebAnswer(p, key, language, geminiFetch);
        await rememberWebResearch(web.webResearch);
        return answerJson({
          answer: web.answer,
          sources: [],
          mode: "gemini_web",
        });
      } catch (e) {
        console.error(
          "Public web unavailable or unsafe; preserving conversation:",
          e,
        );
        return answerJson({
          answer: await safeDirectAnswer(
            question,
            key,
            history,
            true,
            geminiFetch,
          ),
          sources: [],
          mode: "gemini_direct_unverified",
        });
      }
    }
    return answerJson({
      answer: await safeDirectAnswer(
        question,
        key,
        history,
        false,
        geminiFetch,
      ),
      sources: [],
      mode: "gemini_direct",
    });
  } catch (error) {
    console.error("Ask API error:", error);
    const g = error instanceof GeminiDirectError ? error : null;
    return NextResponse.json(
      {
        error: safeError(question),
        diagnosticCode: error instanceof Error ? error.message : "ASK_FAILURE",
        ...(g?.providerStatus
          ? { diagnosticProviderStatus: g.providerStatus }
          : {}),
        ...(g?.providerMessage
          ? { diagnosticProviderMessage: g.providerMessage }
          : {}),
      },
      { status: 500 },
    );
  } finally {
    if (quotaReservation && !successfulAnswerDelivered && runtimeEnv) {
      try {
        await releaseDailyQuestion(runtimeEnv, quotaReservation);
      } catch (error) {
        console.error("Failed to release unsuccessful daily quota reservation", error);
      }
    }
    if (geminiBudget) {
      console.info("Gemini request budget", geminiBudget.snapshot());
    }
  }
}
