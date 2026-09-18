import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";
import { answerStandardsQuestion, isStandardsQuestion } from "../../lib/standards-engine";

const MODEL = "gemini-3.6-flash";

type HistoryItem = { role?: string; content?: string; text?: string };

function normalizeHistory(value: unknown): HistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).filter((item: any) => item && typeof item === "object");
}

function historyText(history: HistoryItem[]) {
  return history
    .map((item) => {
      const role = item.role === "assistant" || item.role === "model" ? "Assistant" : "User";
      const text = typeof item.content === "string" ? item.content : typeof item.text === "string" ? item.text : "";
      return text.trim() ? `${role}: ${text.trim()}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

async function answerDirect(question: string, apiKey: string, history: HistoryItem[] = [], verificationUnavailable = false) {
  const prior = historyText(history);
  const prompt = `You are elevator.help, a Gemini-first conversational assistant specialized in elevators and lift engineering.

PRIMARY BEHAVIOR:
- First understand what the user means, including natural, misspelled, incomplete, shorthand and mixed-language input.
- Reply naturally in the language the user is using now. Preserve technical identifiers, manufacturer names and fault codes.
- Maintain conversational context from the supplied recent conversation when it is relevant.
- Ordinary conversation must work without retrieval tools. If asked whether you are there, who/what you are, or what you can do, answer directly and naturally.
- You can help with elevator troubleshooting, technical concepts, planning, documentation questions and standards-oriented questions when evidence is available.
- Never expose internal filenames, storage locations, archive/Drive links or implementation details.

TECHNICAL SAFETY / EVIDENCE:
- Never invent a fault-code meaning, standard clause, mandatory minimum/maximum, parameter, connector/pin, wiring value, test value or manufacturer-specific procedure.
- If an exact manufacturer-specific or normative fact cannot be verified from evidence supplied by the application, say only that the exact point cannot currently be verified; remain conversational and explain what detail would help.
- Do not pretend that web/library/standards retrieval succeeded when it did not.
${verificationUnavailable ? "- A specialist retrieval tool failed or returned no verified evidence for this turn. Continue the conversation, but explicitly avoid presenting the requested specialist fact as verified." : ""}

RECENT CONVERSATION (may be empty):
${prior || "(none)"}

CURRENT USER MESSAGE:
${question}

Return only the answer to the user.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 1000 },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_DIRECT_HTTP_${response.status}`);
  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("").trim();
  if (!answer) throw new Error("GEMINI_DIRECT_EMPTY");
  return answer;
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

    // Gemini is the semantic brain. The router is used only to decide whether the
    // existing deterministic standards verifier must be invoked. Ordinary conversation
    // has no mandatory Cloudflare/Vectorize/Drive/web dependency.
    let route: any = null;
    try {
      route = await routeQuestion(question);
    } catch (error) {
      console.error("Semantic routing unavailable; continuing direct:", error);
    }

    const effectiveQuestion = route?.normalizedQuestion || question;
    const standardsQuestion = route ? isStandardsQuestion(effectiveQuestion, route) : false;

    if (!standardsQuestion) {
      const answer = await answerDirect(effectiveQuestion, apiKey, history, false);
      return NextResponse.json({ answer, sources: [], mode: "gemini_direct" });
    }

    // Normative/safety-critical claims keep the deterministic raw-evidence gate.
    try {
      const { env } = getCloudflareContext();
      const result = await answerStandardsQuestion(
        effectiveQuestion,
        route,
        apiKey,
        (env as any).AI,
        (env as any).VECTORIZE
      );
      return NextResponse.json({
        answer: result.answer,
        sources: [],
        mode: result.sufficient ? "standards_knowledge_base" : "standards_unverified",
        standardsChecked: result.checkedStandards,
      });
    } catch (error) {
      console.error("Standards tool unavailable; preserving conversation:", error);
      const answer = await answerDirect(effectiveQuestion, apiKey, history, true);
      return NextResponse.json({ answer, sources: [], mode: "gemini_direct_unverified" });
    }
  } catch (error) {
    console.error("Ask API error:", error);
    return NextResponse.json({ error: safeError(question), diagnosticCode: error instanceof Error ? error.message : "ASK_FAILURE" }, { status: 500 });
  }
}
