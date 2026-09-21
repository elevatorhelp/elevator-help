import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";
import { answerStandardsQuestion, isStandardsQuestion } from "../../lib/standards-engine";

const MODEL = "gemini-3.6-flash";
type HistoryItem = { role?: string; content?: string; text?: string };

class GeminiDirectError extends Error {
  providerStatus?: string;
  providerMessage?: string;
  constructor(httpStatus: number, providerStatus?: string, providerMessage?: string) {
    super(`GEMINI_DIRECT_HTTP_${httpStatus}`);
    this.name = "GeminiDirectError";
    this.providerStatus = providerStatus;
    this.providerMessage = providerMessage;
  }
}

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).filter((item: any) => item && typeof item === "object");
}
function historyText(history: HistoryItem[]) {
  return history.map((item) => {
    const role = item.role === "assistant" || item.role === "model" ? "Assistant" : "User";
    const text = typeof item.content === "string" ? item.content : typeof item.text === "string" ? item.text : "";
    return text.trim() ? `${role}: ${text.trim()}` : "";
  }).filter(Boolean).join("\n");
}

function basePrompt(question: string, history: HistoryItem[], verificationUnavailable = false) {
  const prior = historyText(history);
  return `You are elevator.help, a Gemini-first conversational assistant specialized in elevators and lift engineering.

PRIMARY BEHAVIOR:
- Understand natural, misspelled, incomplete, shorthand and mixed-language input.
- Reply naturally in the language the user is using now. Preserve technical identifiers, manufacturer names and fault codes.
- Maintain conversational context from the supplied recent conversation when relevant.
- Ordinary conversation works directly without retrieval. If asked whether you are there, who/what you are, or what you can do, answer directly and naturally.
- You can help with elevator troubleshooting, technical concepts, planning, documentation and standards-oriented questions when evidence is available.
- Never expose internal filenames, storage locations, archive/Drive links or implementation details.

TECHNICAL SAFETY / EVIDENCE:
- Never invent a fault-code meaning, standard clause, mandatory minimum/maximum, parameter, connector/pin, wiring value, test value or manufacturer-specific procedure.
- If an exact manufacturer-specific or normative fact cannot be verified from evidence supplied by the application, say only that the exact point cannot currently be verified; remain conversational and explain what detail would help.
- Do not pretend retrieval succeeded when it did not.
${verificationUnavailable ? "- A specialist retrieval tool failed or returned no verified evidence for this turn. Continue conversationally, but do not present the requested specialist fact as verified." : ""}

RECENT CONVERSATION:
${prior || "(none)"}

CURRENT USER MESSAGE:
${question}

Return only the answer to the user.`;
}

async function callGemini(prompt: string, apiKey: string, useWeb = false) {
  const body: any = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 1000 } };
  if (useWeb) body.tools = [{ google_search: {} }];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    let providerStatus = ""; let providerMessage = "";
    try { const errorBody: any = await response.json(); providerStatus = typeof errorBody?.error?.status === "string" ? errorBody.error.status : ""; providerMessage = typeof errorBody?.error?.message === "string" ? errorBody.error.message.slice(0, 500) : ""; } catch {}
    console.error(useWeb ? "Gemini web request failed" : "Gemini direct request failed", { httpStatus: response.status, providerStatus, providerMessage });
    throw new GeminiDirectError(response.status, providerStatus, providerMessage);
  }
  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim();
  if (!answer) throw new Error(useWeb ? "GEMINI_WEB_EMPTY" : "GEMINI_DIRECT_EMPTY");
  const usage = data?.usageMetadata || {};
  console.info(useWeb ? "Gemini web usage" : "Gemini direct usage", { model: MODEL, promptTokenCount: Number(usage.promptTokenCount || 0), candidatesTokenCount: Number(usage.candidatesTokenCount || 0), thoughtsTokenCount: Number(usage.thoughtsTokenCount || 0), cachedContentTokenCount: Number(usage.cachedContentTokenCount || 0), totalTokenCount: Number(usage.totalTokenCount || 0), promptChars: prompt.length, answerChars: answer.length });
  return answer;
}

async function answerDirect(question: string, apiKey: string, history: HistoryItem[] = [], verificationUnavailable = false) {
  return callGemini(basePrompt(question, history, verificationUnavailable), apiKey, false);
}

function needsPublicWeb(question: string) {
  const current = /\b(latest|current|today|online|web|internet|website|newest|aktuell|heute|online|webseite|internet)\b/i.test(question) || /(جدیدترین|فعلی|امروز|آنلاین|اینترنت|وب)/i.test(question);
  const docs = /\b(manual|datasheet|data\s*sheet|catalog(?:ue)?|handbuch|datenblatt|katalog|betriebsanleitung)\b/i.test(question) || /(دفترچه|کاتالوگ|دیتاشیت|راهنما)/i.test(question);
  const exactFault = /\b(?:fehler|fault|error|code)\s*[A-Z-]*\d{1,4}\b/i.test(question);
  const manufacturer = /\b(Schindler|KONE|Otis|TKE|ThyssenKrupp|NEW\s*LIFT|Ziehl[-\s]*Abegg|Weber)\b/i.test(question);
  return current || docs || (manufacturer && exactFault);
}

// Keep ordinary conversation on the cheap direct path, but route wording that asks for
// mandatory/minimum/maximum/safety-critical elevator requirements through deterministic
// standards verification even when the user never writes EN/Norm/standard explicitly.
function needsStandardsVerification(question: string) {
  const explicit = /\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question) || /\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question) || /(استاندارد|نورم|نُرم)/i.test(question);
  const requirement = /\b(min(?:imum)?\.?|max(?:imum)?\.?|mindestens|höchstens|zulässig|vorgeschrieben|pflicht|erforderlich|muss|darf|clearance|distance|abstand|schutzraum|refuge|guardrail|geländer|schachtwand|kabinenwand)\b/i.test(question) || /(حداقل|حداکثر|مجاز|اجباری|الزامی|فاصله|جان‌پناه|نرده|دیواره?\s*چاه|کابین)/i.test(question);
  const elevator = /\b(aufzug|lift|elevator|kabine|kabin|schacht|fahrkorb|car|shaft|pit|grube|headroom|überfahrt|tür|door)\b/i.test(question) || /(آسانسور|کابین|چاه|چاهک|درب|بالاسری)/i.test(question);
  return explicit || (requirement && elevator);
}
function safeError(question: string) {
  if (/[؀-ۿ]/.test(question)) return "الان ارتباط مستقیم با هوش مصنوعی برقرار نشد. لطفاً همین پیام را یک بار دیگر بفرست.";
  if (/\b(du|dich|was|wie|wer|aufzug|fehler|schacht)\b/i.test(question)) return "Die direkte KI-Verbindung hat gerade nicht geantwortet. Bitte sende dieselbe Nachricht noch einmal.";
  return "The direct AI connection did not respond just now. Please send the same message once more.";
}

export async function POST(request: NextRequest) {
  let question = "";
  try {
    const body: any = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 500 });
    const history = normalizeHistory(body?.history ?? body?.messages ?? body?.conversation);

    if (!needsStandardsVerification(question)) {
      if (needsPublicWeb(question)) {
        try {
          const webPrompt = `${basePrompt(question, history, false)}\n\nPUBLIC WEB MODE:\n- Use Google Search grounding because this turn explicitly needs current/online or manufacturer evidence.\n- Prefer manufacturer/official primary sources where available.\n- Do not expose internal retrieval mechanics or a routine source list.\n- Public web evidence is not a substitute for deterministic standards verification: do not state an exact normative clause/value as verified unless the specialist standards path verifies it.`;
          const answer = await callGemini(webPrompt, apiKey, true);
          return NextResponse.json({ answer, sources: [], mode: "gemini_web" });
        } catch (error) {
          console.error("Public web unavailable; preserving conversation:", error);
          const answer = await answerDirect(question, apiKey, history, true);
          return NextResponse.json({ answer, sources: [], mode: "gemini_direct_unverified" });
        }
      }
      const answer = await answerDirect(question, apiKey, history, false);
      return NextResponse.json({ answer, sources: [], mode: "gemini_direct" });
    }

    let route: any = null;
    try { route = await routeQuestion(question); } catch (error) { console.error("Standards routing unavailable:", error); }
    const effectiveQuestion = route?.normalizedQuestion || question;
    if (route && isStandardsQuestion(effectiveQuestion, route)) {
      try {
        const { env } = getCloudflareContext();
        const result = await answerStandardsQuestion(effectiveQuestion, route, apiKey, (env as any).AI, (env as any).VECTORIZE);
        return NextResponse.json({ answer: result.answer, sources: [], mode: result.sufficient ? "standards_knowledge_base" : "standards_unverified", standardsChecked: result.checkedStandards });
      } catch (error) { console.error("Standards tool unavailable; preserving conversation:", error); }
    }
    const answer = await answerDirect(effectiveQuestion, apiKey, history, true);
    return NextResponse.json({ answer, sources: [], mode: "gemini_direct_unverified" });
  } catch (error) {
    console.error("Ask API error:", error);
    const geminiError = error instanceof GeminiDirectError ? error : null;
    return NextResponse.json({ error: safeError(question), diagnosticCode: error instanceof Error ? error.message : "ASK_FAILURE", ...(geminiError?.providerStatus ? { diagnosticProviderStatus: geminiError.providerStatus } : {}), ...(geminiError?.providerMessage ? { diagnosticProviderMessage: geminiError.providerMessage } : {}) }, { status: 500 });
  }
}
