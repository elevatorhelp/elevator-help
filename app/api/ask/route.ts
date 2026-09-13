import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";

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

async function translateRetrievalQuery(
  question: string,
  sourceLanguage: string,
  apiKey: string
) {
  const prompt = `
Translate the following elevator technical question into concise technical ${languageName(
    sourceLanguage
  )} for semantic search in elevator manuals.

Rules:
- Preserve the exact technical meaning.
- Preserve manufacturer names exactly.
- Preserve controller names exactly.
- Preserve fault families exactly.
- Preserve fault codes exactly.
- Preserve connector names, parameter names and component names when appropriate.
- Do not answer the question.
- Do not explain anything.
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

  if (!response.ok) {
    throw new Error(
      `Gemini translation error: ${await response.text()}`
    );
  }

  const data: any = await response.json();
  const translated =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!translated) {
    throw new Error("Gemini returned no translated retrieval query");
  }

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
    route.manufacturer ||
      route.controller ||
      route.faultFamily ||
      route.faultCode
  );
}

function rerankMatches(matches: any[], route: any) {
  return [...matches].sort((a: any, b: any) => {
    const score = (match: any) => {
      const metadata = match?.metadata || {};
      let value = Number(match?.score || 0);

      // Exact identifiers are stronger than tiny semantic-score differences.
      // We still never invent a numeric faultCode from symptoms.
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
    new Set(
      [preferredLanguage, ...SOURCE_LANGUAGE_FALLBACKS].filter(Boolean)
    )
  );

  for (const sourceLanguage of languages) {
    const retrievalQuery =
      route.questionLanguage === sourceLanguage
        ? question
        : await translateRetrievalQuery(
            question,
            sourceLanguage,
            apiKey
          );

    const embeddingResult = await ai.run(
      "@cf/baai/bge-base-en-v1.5",
      { text: [retrievalQuery] }
    );

    const queryVector = (embeddingResult as any).data?.[0];

    if (!queryVector) {
      throw new Error("No query embedding returned");
    }

    const filter = buildKnowledgeFilter(route, sourceLanguage);

    const result = await vectorize.query(queryVector, {
      topK: 5,
      returnMetadata: "all",
      filter,
    });

    const rawMatches = (result.matches || []).filter(
      (match: any) =>
        typeof match?.metadata?.text === "string" &&
        match.metadata.text.trim().length > 0
    );

    if (!rawMatches.length) continue;

    const topSemanticScore = Number(rawMatches[0]?.score || 0);
    const exactFaultCode = Boolean(route.faultCode);

    if (!exactFaultCode && topSemanticScore < MIN_SEMANTIC_SCORE) {
      continue;
    }

    const matches = rerankMatches(rawMatches, route);

    return {
      sourceLanguage,
      retrievalQuery,
      filter,
      matches,
    };
  }

  return null;
}

function buildInternalReferences(matches: any[]) {
  const references = matches.slice(0, 4).map((match: any) => {
    const metadata = match.metadata || {};
    const pieces = [
      "Technical documentation",
      metadata.manufacturer,
      metadata.controller,
      metadata.faultName,
      metadata.page ? `p. ${metadata.page}` : null,
    ].filter(Boolean);

    return { title: pieces.join(" · ") };
  });

  return references.filter(
    (reference: any, index: number, array: any[]) =>
      array.findIndex((item) => item.title === reference.title) === index
  );
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
At the end, add one brief service notice in the user's language. It must say that authorized service technicians should verify the procedure against their company's current technical documentation. Independent service providers should contact the original manufacturer for manufacturer-specific procedures, software or restricted technical information.
`;
}

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

      return `SOURCE ${index + 1}
Manufacturer: ${metadata.manufacturer || "unknown"}
Controller: ${metadata.controller || "unknown"}
Fault family: ${metadata.faultFamily || "unknown"}
Fault code: ${metadata.faultCode || "unknown"}
Fault name: ${metadata.faultName || "unknown"}
Page: ${metadata.page || "unknown"}
Semantic score: ${match.score}
Excerpt: ${metadata.text}`;
    })
    .join("\n\n");

  const prompt = `
You are Elevator Agent, a technical assistant for elevator technicians, engineers and inspectors.

Answer the user's question using ONLY the supplied technical source excerpts below.

GROUNDING RULES:
- Do not use outside knowledge.
- Do not invent fault meanings, parameters, connector numbers, test values or procedures.
- If the excerpts do not support a claim, do not make it.
- SOURCE 1 has been deterministically reranked using Router evidence when available; prefer it when sources overlap.
- Distinguish documented fault meaning from possible checks.
- Do not expose internal file names, storage locations or internal document identifiers.
- You may identify manufacturer, controller, fault name and page when useful.
- Do not create a References section; the application displays sources separately.

ANSWER STYLE:
- Answer in the same language as the user's question.
- Be concise and practical for a working elevator technician.
- For a fault or malfunction, give the verified meaning first, then a short ordered diagnostic sequence.
- Only include steps directly supported by the excerpts.
- If additional model/controller/site information is required, ask specifically for it.
${manufacturerServiceInstruction(route.manufacturer)}

User question:
${question}

Router context:
${JSON.stringify(route)}

Technical source excerpts:
${excerpts}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1400,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Gemini grounded-answer error: ${await response.text()}`
    );
  }

  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned no grounded answer");
  }

  return answer;
}

async function answerFromWeb(
  question: string,
  route: any,
  apiKey: string
) {
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
- For troubleshooting, prefer actionable verified checks over generic explanations.
- Do not create a References section inside the answer; the application displays sources separately.
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
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 1800,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini web error: ${await response.text()}`);
  }

  const data: any = await response.json();

  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  const grounding =
    data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  const sources = grounding
    .filter((chunk: any) => chunk?.web?.uri && chunk?.web?.title)
    .map((chunk: any) => ({
      title: chunk.web.title,
      url: chunk.web.uri,
    }))
    .filter(
      (source: any, index: number, array: any[]) =>
        array.findIndex((item) => item.url === source.url) === index
    )
    .slice(0, 8);

  return {
    answer: answer || "No verified answer was returned.",
    sources,
  };
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { error: "Gemini API is not configured." },
        { status: 500 }
      );
    }

    const route = await routeQuestion(question);

    if (
      route.needsClarification ||
      route.searchStrategy === "clarify_first"
    ) {
      return NextResponse.json({
        answer:
          route.clarificationQuestion ||
          "I need one more detail before I can give you a reliable answer.",
        sources: [],
        disclosure:
          "No technical source was searched because the question needs clarification first.",
        mode: "clarification",
      });
    }

    const { env } = getCloudflareContext();
    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;

    const retrieval = await retrieveOwnKnowledge(
      question,
      route,
      apiKey,
      ai,
      vectorize
    );

    if (retrieval) {
      const answer = await answerFromKnowledge(
        question,
        route,
        retrieval,
        apiKey
      );

      return NextResponse.json({
        answer,
        sources: buildInternalReferences(retrieval.matches),
        disclosure:
          "Technical information is based on indexed technical documentation. Verify safety-critical procedures against the current applicable documentation and site conditions.",
        mode: "knowledge_base",
      });
    }

    const webResult = await answerFromWeb(question, route, apiKey);

    return NextResponse.json({
      answer: webResult.answer,
      sources: webResult.sources,
      disclosure:
        "Technical information is gathered from publicly available online sources and technical documentation.",
      mode: "web_fallback",
    });
  } catch (error) {
    console.error("Ask API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while processing the question.",
      },
      { status: 500 }
    );
  }
}
