import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";

const SOURCE_LANGUAGE_FALLBACKS = ["de", "en"];
const MIN_SEMANTIC_SCORE = 0.72;
const MIN_STANDARD_SCORE = 0.48;

const CORE_STANDARDS = [
  { code: "EN 81-20", compact: "EN8120" },
  { code: "EN 81-50", compact: "EN8150" },
] as const;

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

function isStandardsQuestion(question: string, route?: any) {
  if (route?.intent === "standard") return true;

  return (
    /\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question) ||
    /\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question) ||
    /(استاندارد|نورم|نُرم)/i.test(question)
  );
}

function explicitlyNamedCoreStandards(question: string) {
  return CORE_STANDARDS.filter((standard) => {
    const number = standard.code.endsWith("20") ? "20" : "50";
    return new RegExp(`(?:EN\\s*81\\s*[-–]?\\s*${number}|81\\s*[-–]\\s*${number})`, "i").test(
      question
    );
  }).map((standard) => standard.code);
}

async function answerWhyElevatorHelp(question: string, apiKey: string) {
  const prompt = `
Answer the user's question about why they should use elevator.help instead of a general-purpose AI assistant.

FACTS YOU MAY STATE:
- elevator.help has a specialized elevator-domain routing and knowledge engine around the AI layer.
- It can route questions by manufacturer, controller, fault family, fault code, component and standards context when that information is available.
- It is designed to search its own indexed elevator technical knowledge first and use public web research only when the internal evidence is insufficient.
- Its workflows are designed and continuously refined with input from elevator-industry specialists and real elevator troubleshooting/planning needs.
- Its goal is practical, step-by-step elevator troubleshooting and technical guidance rather than generic conversation.
- It supports multilingual questions while preserving technical identifiers and terminology.
- It does not replace current manufacturer instructions, binding standards or on-site safety assessment.

IMPORTANT POSITIONING:
- Do not claim that elevator.help trained its own foundation model from scratch.
- The differentiator is the specialized elevator engine, indexed knowledge, routing, retrieval and workflow layer around the AI.
- Do not mention internal file names, source lists, storage systems or implementation details.
- Keep it confident and concise, not exaggerated.
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
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini product-answer error: ${await response.text()}`);
  }

  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned no product-positioning answer");
  }

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
  )} for semantic search in elevator manuals and standards.

Rules:
- Preserve the exact technical meaning.
- Preserve manufacturer names exactly.
- Preserve controller names exactly.
- Preserve fault families exactly.
- Preserve fault codes exactly.
- Preserve standard identifiers such as EN 81-20 and EN 81-50 exactly.
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
    throw new Error(`Gemini translation error: ${await response.text()}`);
  }

  const data: any = await response.json();
  const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

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

    if (!exactFaultCode && topSemanticScore < MIN_SEMANTIC_SCORE) continue;

    return {
      sourceLanguage,
      retrievalQuery,
      filter,
      matches: rerankMatches(rawMatches, route),
    };
  }

  return null;
}

function compactStandardMetadata(metadata: any) {
  return `${metadata?.fileName || ""} ${metadata?.sourcePath || ""} ${
    metadata?.documentGroup || ""
  }`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function matchBelongsToStandard(match: any, compactCode: string) {
  return compactStandardMetadata(match?.metadata).includes(compactCode);
}

async function queryOneCoreStandard(
  question: string,
  route: any,
  standard: (typeof CORE_STANDARDS)[number],
  apiKey: string,
  ai: any,
  vectorize: any
) {
  const preferredLanguage =
    route.preferredSourceLanguage || route.questionLanguage || "de";
  const languages = Array.from(
    new Set([preferredLanguage, "de", ...SOURCE_LANGUAGE_FALLBACKS].filter(Boolean))
  );

  for (const sourceLanguage of languages) {
    const translated =
      route.questionLanguage === sourceLanguage
        ? question
        : await translateRetrievalQuery(question, sourceLanguage, apiKey);
    const retrievalQuery = `${translated}\nStandard: ${standard.code}`;

    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: [retrievalQuery],
    });
    const queryVector = (embeddingResult as any).data?.[0];
    if (!queryVector) throw new Error("No standards query embedding returned");

    const result = await vectorize.query(queryVector, {
      topK: 25,
      returnMetadata: "all",
      filter: {
        language: sourceLanguage,
        contentType: "standard",
      },
    });

    const matches = (result.matches || [])
      .filter(
        (match: any) =>
          typeof match?.metadata?.text === "string" &&
          match.metadata.text.trim().length > 0 &&
          matchBelongsToStandard(match, standard.compact)
      )
      .filter((match: any) => Number(match?.score || 0) >= MIN_STANDARD_SCORE)
      .slice(0, 6);

    if (matches.length) {
      return { standard: standard.code, sourceLanguage, retrievalQuery, matches };
    }
  }

  return { standard: standard.code, sourceLanguage: null, retrievalQuery: null, matches: [] };
}

async function retrieveCoreStandards(
  question: string,
  route: any,
  apiKey: string,
  ai: any,
  vectorize: any
) {
  // v1 policy: every elevator standards question checks both EN 81-20 and EN 81-50.
  const checked = [];
  for (const standard of CORE_STANDARDS) {
    checked.push(
      await queryOneCoreStandard(
        question,
        route,
        standard,
        apiKey,
        ai,
        vectorize
      )
    );
  }

  return {
    checkedStandards: CORE_STANDARDS.map((standard) => standard.code),
    explicitlyNamed: explicitlyNamedCoreStandards(question),
    results: checked,
    matches: checked.flatMap((entry) =>
      entry.matches.map((match: any) => ({ ...match, standardCode: entry.standard }))
    ),
  };
}

function parseModelJson(text: string) {
  const trimmed = text.trim();
  const attempts = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
  ];

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  const cleaned = attempts[attempts.length - 1];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(cleaned.slice(first, last + 1));
    } catch {}
  }

  return null;
}

async function answerFromStandards(
  question: string,
  route: any,
  retrieval: any,
  apiKey: string
) {
  if (!retrieval.matches.length) {
    return { sufficient: false, answer: "" };
  }

  const excerpts = retrieval.matches
    .sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 10)
    .map((match: any, index: number) => {
      const metadata = match.metadata || {};
      return `EVIDENCE ${index + 1}\nSTANDARD: ${match.standardCode}\nINTERNAL PAGE: ${
        metadata.page || "unknown"
      }\nEXCERPT:\n${metadata.text}`;
    })
    .join("\n\n");

  const prompt = `
You are the standards evidence layer of elevator.help.

The user asked an elevator standards question. For this v1 engine, both EN 81-20 and EN 81-50 have been checked. Answer ONLY from the supplied excerpts.

STRICT EVIDENCE GATE:
- Do not use outside knowledge.
- Do not invent or reconstruct requirements from memory.
- Every normative requirement in the final answer MUST identify BOTH the exact standard and the exact clause/section number that supports it, for example: "EN 81-20, Abschnitt 5.2.1.4: ...".
- Any exact clause/section number you mention MUST appear verbatim in the supplied excerpt supporting that claim.
- If you cannot verify an exact clause/section number for a requirement from the supplied excerpts, OMIT that requirement.
- If no useful requirement remains with a verified exact clause/section number, set sufficient=false instead of giving a general summary.
- Any numeric value, dimension, distance, force, time, tolerance, illumination value, unit or limit you mention MUST appear verbatim in the supplied excerpt supporting that claim.
- Never transfer a clause number or value from one standard to the other.
- If a statement is only an engineering inference and not directly supported, omit it.
- Do not expose file names, page numbers, storage locations, source lists or internal evidence labels.
- If one standard has no relevant evidence, do not force it into the answer merely because it was checked.
- If the user explicitly named one of the two standards, focus the answer on it, while using the other only if it directly adds relevant requirements.

ANSWER STYLE:
- Use the same language as the user's question.
- Be concise, technical and practical.
- Prefer one bullet per verified requirement, starting with "EN 81-20, Abschnitt ..." or "EN 81-50, Abschnitt ...".
- Separate requirements from interpretation when useful.
- Do not add a references/sources section.

Return ONLY valid JSON:
{
  "sufficient": true | false,
  "answer": "final user-facing answer, or empty string if insufficient"
}

User question:
${question}

Router context:
${JSON.stringify(route)}

Explicitly named core standards:
${JSON.stringify(retrieval.explicitlyNamed)}

Evidence:
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
          responseMimeType: "application/json",
          temperature: 0,
          maxOutputTokens: 1600,
        },
      }),
    }
  );

  if (!response.ok) {
    return { sufficient: false, answer: "" };
  }

  const data: any = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  const parsed = raw ? parseModelJson(raw) : null;
  const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  const hasStandardClauseCitation =
    /EN\s*81\s*[-–]\s*(?:20|50)[^\n]{0,100}\b\d+(?:\.\d+){1,5}\b/i.test(answer);

  return {
    sufficient:
      parsed?.sufficient === true &&
      answer.length > 0 &&
      hasStandardClauseCitation,
    answer: hasStandardClauseCitation ? answer : "",
  };
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

const ANSWER_VISIBILITY_RULES = `
SOURCE VISIBILITY RULES:
- Use sources internally for grounding, but do not expose or list them to the user.
- Do not say "according to the manual", "according to the documentation", "according to this website", "source says", or similar source-attribution phrases.
- Do not name a website, manual, document, file, source title, page number, storage location or internal identifier merely to prove the answer.
- Exception for standards: when the evidence supports it, you may cite the exact standard designation and an exact clause/section number inline, e.g. "EN 81-20, clause ...". Never invent a clause number.
- Exception for parts purchasing: a direct seller/product URL may be shown only when a user-provided part image has been confidently identified and a matching seller/product page has been verified. Do not show general research-source links.
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
      }\nPage: ${metadata.page || "unknown"}\nSemantic score: ${
        match.score
      }\nExcerpt: ${metadata.text}`;
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
- You may identify manufacturer, controller and fault name when useful.
${ANSWER_VISIBILITY_RULES}

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
    throw new Error(`Gemini grounded-answer error: ${await response.text()}`);
  }

  const data: any = await response.json();
  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  if (!answer) throw new Error("Gemini returned no grounded answer");
  return answer;
}

async function answerFromWeb(question: string, route: any, apiKey: string) {
  const standardsRules = isStandardsQuestion(question, route)
    ? `\nSTANDARDS VERIFICATION RULES:\n- For EN 81-20 / EN 81-50 claims, use authoritative or official technical evidence when available.\n- Every normative requirement you state must identify the exact standard AND exact clause/section number that supports it.\n- Do not state an exact clause number, numeric requirement or limit unless it is directly verified by the search evidence.\n- If you cannot verify the exact clause/section for a standards requirement, do not present that requirement as normative. Say that the exact clause could not be verified rather than guessing.\n`
    : "";

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
${ANSWER_VISIBILITY_RULES}
${standardsRules}
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

  return { answer: answer || "No verified answer was returned." };
}

export async function POST(request: NextRequest) {
  try {
    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API is not configured." },
        { status: 500 }
      );
    }

    if (isWhyElevatorHelpQuestion(question)) {
      const answer = await answerWhyElevatorHelp(question, apiKey);
      return NextResponse.json({ answer, sources: [], mode: "about_elevator_help" });
    }

    const route = await routeQuestion(question);
    const { env } = getCloudflareContext();
    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;

    if (isStandardsQuestion(question, route)) {
      const standardsRetrieval = await retrieveCoreStandards(
        question,
        route,
        apiKey,
        ai,
        vectorize
      );
      const standardsAnswer = await answerFromStandards(
        question,
        route,
        standardsRetrieval,
        apiKey
      );

      if (standardsAnswer.sufficient && standardsAnswer.answer) {
        return NextResponse.json({
          answer: standardsAnswer.answer,
          sources: [],
          mode: "standards_knowledge_base",
          standardsChecked: standardsRetrieval.checkedStandards,
        });
      }

      const webResult = await answerFromWeb(question, route, apiKey);
      return NextResponse.json({
        answer: webResult.answer,
        sources: [],
        mode: "standards_web_fallback",
        standardsChecked: standardsRetrieval.checkedStandards,
      });
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
      return NextResponse.json({ answer, sources: [], mode: "knowledge_base" });
    }

    const webResult = await answerFromWeb(question, route, apiKey);
    return NextResponse.json({
      answer: webResult.answer,
      sources: [],
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
