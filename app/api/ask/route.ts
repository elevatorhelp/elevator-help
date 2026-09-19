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

async function answerDirect(question: string, apiKey: string, history: HistoryItem[] = [], verificationUnavailable = false) {
  const prior = historyText(history);
  const prompt = `You are elevator.help, a Gemini-first conversational assistant specialized in elevators and lift engineering.

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
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 1000 } }),
  });
  if (!response.ok) {
    let providerStatus = "";
    let providerMessage = "";
    try {
      const errorBody: any = await response.json();
      providerStatus = typeof errorBody?.error?.status === "string" ? errorBody.error.status : "";
      providerMessage = typeof errorBody?.error?.message === "string" ? errorBody.error.message.slice(0, 500) : "";
    } catch {}
    console.error("Gemini direct request failed", { httpStatus: response.status, providerStatus, providerMessage });
    throw new GeminiDirectError(response.status, providerStatus, providerMessage);
  }
  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim();
  if (!answer) throw new Error("GEMINI_DIRECT_EMPTY");
  return answer;
}

function isExplicitStandardsRequest(question: string) {
  return /\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question) || /\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question) || /(استاندارد|نورم|نُرم)/i.test(question);
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

    // Phase 1 invariant: ordinary conversation is exactly one direct Gemini call.
    // Do not spend a second Gemini subrequest on semantic routing before the answer.
    if (!isExplicitStandardsRequest(question)) {
      const answer = await answerDirect(question, apiKey, history, false);
      return NextResponse.json({ answer, sources: [], mode: "gemini_direct" });
    }

    // Explicit normative requests may enter the specialist path. A failure there
    // degrades to conversational Gemini without inventing an unverified norm fact.
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
    return NextResponse.json({
      error: safeError(question),
      diagnosticCode: error instanceof Error ? error.message : "ASK_FAILURE",
      ...(geminiError?.providerStatus ? { diagnosticProviderStatus: geminiError.providerStatus } : {}),
      ...(geminiError?.providerMessage ? { diagnosticProviderMessage: geminiError.providerMessage } : {}),
    }, { status: 500 });
  }
}
