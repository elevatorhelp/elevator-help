import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";
import {
  answerStandardsQuestion,
  isStandardsQuestion,
} from "../../lib/standards-engine";

const SOURCE_LANGUAGE_FALLBACKS = ["de", "en"];
const MIN_SEMANTIC_SCORE = 0.72;

function languageName(code: string) {
  const names: Record<string, string> = {
    de: "German",
    en: "English",
    fa: "Persian",
    hr: "Croatian",
    ru: "Russian",
    ar: "Arabic",
    tr: "Turkish",
  };
  return names[code] || `language code ${code}`;
}

function isWhyElevatorHelpQuestion(question: string) {
  const normalized = question.toLowerCase();
  const patterns = [
    /why\s+(should\s+i\s+)?(use|choose).*(elevator\.help|you|this)/i,
    /(difference|different|better).*(chatgpt|gemini|other ai|general ai)/i,
    /warum.*(elevator\.help|euch|dich|benutzen|nutzen)/i,
    /unterschied.*(chatgpt|gemini|ki|andere ki)/i,
    /چرا.*(شما|elevator\.help|الویتور|استفاده)/i,
    /فرق.*(هوش مصنوعی|چت.?جی.?پی.?تی|جمینای|gemini|chatgpt)/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isIdentityQuestion(question: string) {
  return (
    /\b(who are you|what are you|what is elevator\.help)\b/i.test(question) ||
    /\b(wer bist du|was bist du|was ist elevator\.help)\b/i.test(question) ||
    /(تو کی هستی|شما کی هستید|elevator\.help چیست|الویتور هلپ چیست)/i.test(question)
  );
}

function isContactQuestion(question: string) {
  return (
    /(contact|email|e-mail|kontakt|erreichen|تماس|ایمیل)/i.test(question) &&
    /(elevator\.help|you|euch|dich|شما|سایت)/i.test(question)
  );
}

function isAdvertisingQuestion(question: string) {
  return /(advertis|werbung|anzeige|تبلیغ|آگهی)/i.test(question);
}

function languageFromText(question: string) {
  if (/[؀-ۿ]/.test(question)) return "fa";
  if (/\b(wer|was|warum|wie|kontakt|werbung|aufzug|schacht|fehler)\b/i.test(question)) {
    return "de";
  }
  return "en";
}

function contactAnswer(language: string, advertising = false) {
  if (language === "de") {
    return advertising
      ? "Für Werbeanfragen erreichst du elevator.help unter info@elevator.help."
      : "Du erreichst elevator.help unter info@elevator.help.";
  }
  if (language === "fa") {
    return advertising
      ? "برای هماهنگی تبلیغات با info@elevator.help تماس بگیر."
      : "برای تماس با elevator.help می‌توانی به info@elevator.help ایمیل بزنی.";
  }
  return advertising
    ? "For advertising inquiries, please contact info@elevator.help."
    : "You can contact elevator.help at info@elevator.help.";
}

async function answerProductQuestion(
  question: string,
  apiKey: string,
  mode: "why" | "identity"
) {
  const task =
    mode === "identity"
      ? "Answer who/what elevator.help is."
      : "Answer why someone should use elevator.help instead of a general-purpose AI assistant.";

  const prompt = `
${task}

FACTS YOU MAY STATE:
- elevator.help is a specialized AI assistant for elevator engineering and technical work.
- It has an elevator-domain routing and knowledge layer around the AI model.
- It can route questions by manufacturer, controller, fault family, fault code, component and standards context when the evidence supports it.
- It is designed to search its own indexed elevator technical knowledge first and use public web research only for non-standards questions when internal evidence is insufficient.
- Its workflows are designed and refined with input from independent elevator-industry specialists and practical troubleshooting/planning needs.
- It is intended for troubleshooting, technical documentation, standards, components, planning and engineering support.
- It supports multilingual questions while preserving technical identifiers and terminology.
- It does not replace current manufacturer instructions, binding standards or on-site safety assessment.

POSITIONING RULES:
- Do not claim elevator.help trained its own foundation model from scratch.
- The differentiator is the specialized elevator engine, indexed knowledge, routing, retrieval and workflow layer around the AI.
- Do not mention internal file names, storage systems or implementation details.
- Sound natural and confident, not like canned marketing copy.
- Answer in the same language as the user.

User question:
${question}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
    }
  );

  if (!response.ok) throw new Error("Product answer failed");
  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  if (!answer) throw new Error("Product answer was empty");
  return answer;
}

async function translateRetrievalQuery(
  question: string,
  sourceLanguage: string,
  apiKey: string
) {
  const prompt = `
Translate the following elevator technical question into concise technical ${languageName(
    sourceLanguage
  )} for semantic search in elevator manuals and technical documentation.

Rules:
- Preserve the exact technical meaning.
- Preserve manufacturer names, controller names, fault families and fault codes exactly.
- Preserve connector names, parameter names and component names when appropriate.
- Do not answer the question.
- Return only the translated technical search query.

Question:
${question}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    }
  );

  if (!response.ok) throw new Error("Retrieval translation failed");
  const data: any = await response.json();
  const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!translated) throw new Error("Retrieval translation was empty");
  return translated;
}

function buildKnowledgeFilter(route: any, language: string) {
  const filter: Record<string, string> = { language };
  if (route.manufacturer) filter.manufacturer = route.manufacturer;
  if (route.controller) filter.controller = route.controller;
  if (route.faultFamily) filter.faultFamily = route.faultFamily;
  if (route.faultCode) filter.faultCode = String(route.faultCode);
  if (route.faultFamily || route.faultCode || route.faultName) {
    filter.contentType = "fault";
  }
  return filter;
}

function hasEnoughRoutingContext(route: any) {
  return Boolean(
    route.manufacturer || route.controller || route.faultFamily || route.faultCode
  );
}

function rerankMatches(matches: any[], route: any) {
  return [...matches].sort((a: any, b: any) => {
    const score = (match: any) => {
      const metadata = match?.metadata || {};
      let value = Number(match?.score || 0);

      if (
        route.faultCode &&
        String(metadata.faultCode || "") === String(route.faultCode)
      ) {
        value += 10;
      }

      if (
        route.faultName &&
        (route.confidence === "high" || route.confidence === "medium") &&
        String(metadata.faultName || "").toUpperCase() ===
          String(route.faultName).toUpperCase()
      ) {
        value += 5;
      }

      if (
        route.faultFamily &&
        String(metadata.faultFamily || "").toUpperCase() ===
          String(route.faultFamily).toUpperCase()
      ) {
        value += 1;
      }

      return value;
    };

    return score(b) - score(a);
  });
}

async function retrieveOwnKnowledge(
  question: string,
  route: any,
  apiKey: string,
  ai: any,
  vectorize: any
) {
  if (!hasEnoughRoutingContext(route)) return null;

  const preferredLanguage =
    route.preferredSourceLanguage || route.questionLanguage || "en";
  const languages = Array.from(
    new Set([preferredLanguage, ...SOURCE_LANGUAGE_FALLBACKS].filter(Boolean))
  );

  for (const sourceLanguage of languages) {
    const retrievalQuery =
      route.questionLanguage === sourceLanguage
        ? question
        : await translateRetrievalQuery(question, sourceLanguage, apiKey);

    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: [retrievalQuery],
    });
    const queryVector = (embeddingResult as any).data?.[0];
    if (!queryVector) throw new Error("No query embedding returned");

    const result = await vectorize.query(queryVector, {
      topK: 5,
      returnMetadata: "all",
      filter: buildKnowledgeFilter(route, sourceLanguage),
    });

    const rawMatches = (result.matches || []).filter(
      (match: any) =>
        typeof match?.metadata?.text === "string" &&
        match.metadata.text.trim().length > 0
    );
    if (!rawMatches.length) continue;

    const topSemanticScore = Number(rawMatches[0]?.score || 0);
    if (!route.faultCode && topSemanticScore < MIN_SEMANTIC_SCORE) continue;

    return {
      sourceLanguage,
      retrievalQuery,
      matches: rerankMatches(rawMatches, route),
    };
  }

  return null;
}

function manufacturerServiceInstruction(manufacturer?: string | null) {
  if (!manufacturer) return "";
  const normalized = manufacturer.toLowerCase();
  const needsNotice =
    normalized.includes("schindler") ||
    normalized.includes("kone") ||
    normalized.includes("otis") ||
    normalized.includes("tk elevator") ||
    normalized === "tke" ||
    normalized.includes("thyssenkrupp");

  if (!needsNotice) return "";

  return `
SERVICE NOTICE REQUIREMENT:
At the end, add one brief service notice in the user's language. Authorized service technicians should verify the procedure against their company's current technical documentation. Independent service providers should contact the original manufacturer for manufacturer-specific procedures, software or restricted technical information.
`;
}

const ANSWER_VISIBILITY_RULES = `
SOURCE VISIBILITY RULES:
- Use sources internally for grounding, but do not expose or list them to the user.
- Do not name websites, manuals, files, page numbers, storage locations or internal identifiers merely to prove the answer.
- Do not add a Sources or References section.
- For parts purchasing, a direct seller/product URL may be shown only when a user-provided part image has been confidently identified and a matching seller/product page has been verified.
`;

async function answerFromKnowledge(
  question: string,
  route: any,
  retrieval: any,
  apiKey: string
) {
  const excerpts = retrieval.matches
    .slice(0, 5)
    .map((match: any, index: number) => {
      const metadata = match.metadata || {};
      return `SOURCE ${index + 1}\nManufacturer: ${
        metadata.manufacturer || "unknown"
      }\nController: ${metadata.controller || "unknown"}\nFault family: ${
        metadata.faultFamily || "unknown"
      }\nFault code: ${metadata.faultCode || "unknown"}\nFault name: ${
        metadata.faultName || "unknown"
      }\nExcerpt: ${metadata.text}`;
    })
    .join("\n\n");

  const prompt = `
You are Elevator Agent, a technical assistant for elevator technicians, engineers and inspectors.
Answer using ONLY the supplied technical excerpts.

GROUNDING RULES:
- Do not use outside knowledge.
- Do not invent fault meanings, parameters, connector numbers, test values or procedures.
- If the excerpts do not support a claim, do not make it.
- Distinguish documented fault meaning from possible checks.
${ANSWER_VISIBILITY_RULES}

ANSWER STYLE:
- Answer in the same language as the user's question.
- Be concise and practical.
- For a fault, give the verified meaning first, then a short ordered diagnostic sequence.
- Only include steps directly supported by the excerpts.
- If additional model/controller/site information is required, ask specifically for it.
${manufacturerServiceInstruction(route.manufacturer)}

User question:
${question}

Router context:
${JSON.stringify(route)}

Technical excerpts:
${excerpts}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1400 },
      }),
    }
  );

  if (!response.ok) throw new Error("Grounded answer failed");
  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  if (!answer) throw new Error("Grounded answer was empty");
  return answer;
}

async function answerFromWeb(question: string, route: any, apiKey: string) {
  const prompt = `
You are Elevator Agent, a technical research and troubleshooting assistant for elevator technicians, engineers, inspectors and architects.
The indexed technical knowledge base did not provide sufficiently strong evidence, so use Google Search.

SEARCH PRIORITY:
1. Manufacturer official technical documentation
2. Manufacturer service or fault-code documentation
3. Standards bodies and official/public technical guidance
4. Reliable elevator-industry technical sources
5. Other public web sources only when better evidence is unavailable

RULES:
- Never invent fault-code meanings, test values, connector or pin numbers, parameters, wiring information, manual references or troubleshooting procedures.
- If information cannot be verified, say so and ask for the missing manufacturer/controller/model/document when appropriate.
- Answer in the same language as the user's question.
- Be concise but technically useful.
${ANSWER_VISIBILITY_RULES}
${manufacturerServiceInstruction(route.manufacturer)}

Router context:
${JSON.stringify(route)}

User question:
${question}
`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1800 },
      }),
    }
  );

  if (!response.ok) throw new Error("Web answer failed");
  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  return answer || "No verified answer was returned.";
}

function safeErrorMessage(language?: string | null) {
  if (language === "de") {
    return "Die Anfrage konnte gerade nicht zuverlässig verarbeitet werden. Bitte versuche es noch einmal.";
  }
  if (language === "fa") {
    return "در حال حاضر نتوانستم درخواست را با اطمینان پردازش کنم. لطفاً دوباره امتحان کن.";
  }
  return "I could not process the request reliably just now. Please try again.";
}

export async function POST(request: NextRequest) {
  let detectedLanguage: string | null = null;

  try {
    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI is not configured." }, { status: 500 });
    }

    const obviousLanguage = languageFromText(question);

    if (isAdvertisingQuestion(question)) {
      return NextResponse.json({
        answer: contactAnswer(obviousLanguage, true),
        sources: [],
        mode: "contact",
      });
    }

    if (isContactQuestion(question)) {
      return NextResponse.json({
        answer: contactAnswer(obviousLanguage, false),
        sources: [],
        mode: "contact",
      });
    }

    if (isIdentityQuestion(question)) {
      const answer = await answerProductQuestion(question, apiKey, "identity");
      return NextResponse.json({
        answer,
        sources: [],
        mode: "about_elevator_help",
      });
    }

    if (isWhyElevatorHelpQuestion(question)) {
      const answer = await answerProductQuestion(question, apiKey, "why");
      return NextResponse.json({
        answer,
        sources: [],
        mode: "about_elevator_help",
      });
    }

    const route = await routeQuestion(question);
    detectedLanguage = route.questionLanguage;

    const { env } = getCloudflareContext();
    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;

    if (isStandardsQuestion(question, route)) {
      try {
        const standardsResult = await answerStandardsQuestion(
          question,
          route,
          apiKey,
          ai,
          vectorize
        );

        return NextResponse.json({
          answer: standardsResult.answer,
          sources: [],
          mode: standardsResult.sufficient
            ? "standards_knowledge_base"
            : "standards_unverified",
          standardsChecked: standardsResult.checkedStandards,
        });
      } catch (standardsError) {
        console.error("Standards pipeline error:", standardsError);
        const language = route.questionLanguage || detectedLanguage;
        const answer = language === "de"
          ? "Ich konnte die Normenabfrage gerade nicht vollständig verifizieren. Ich gebe deshalb keine unbestätigte Normangabe aus. Bitte versuche die Frage gleich noch einmal."
          : language === "fa"
            ? "در حال حاضر نتوانستم بررسی استاندارد را کامل و دقیق تأیید کنم؛ بنابراین بند یا عدد تأییدنشده ارائه نمی‌دهم. لطفاً همین سؤال را دوباره امتحان کن."
            : "I could not complete exact standards verification just now, so I will not return an unverified clause or value. Please retry the same question shortly.";
        return NextResponse.json({
          answer,
          sources: [],
          mode: "standards_unverified",
          standardsChecked: ["EN 81-20", "EN 81-50"],
        });
      }
    }

    if (route.needsClarification || route.searchStrategy === "clarify_first") {
      return NextResponse.json({
        answer:
          route.clarificationQuestion ||
          "I need one more detail before I can give you a reliable answer.",
        sources: [],
        mode: "clarification",
      });
    }

    const retrieval = await retrieveOwnKnowledge(
      question,
      route,
      apiKey,
      ai,
      vectorize
    );

    if (retrieval) {
      const answer = await answerFromKnowledge(question, route, retrieval, apiKey);
      return NextResponse.json({
        answer,
        sources: [],
        mode: "knowledge_base",
      });
    }

    const answer = await answerFromWeb(question, route, apiKey);
    return NextResponse.json({
      answer,
      sources: [],
      mode: "web_fallback",
    });
  } catch (error) {
    console.error("Ask API error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(detectedLanguage) },
      { status: 500 }
    );
  }
}
