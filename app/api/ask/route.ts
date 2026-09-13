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
    return new RegExp(
      `(?:EN\\s*81\\s*[-–]?\\s*${number}|81\\s*[-–]\\s*${number})`,
      "i"
    ).test(question);
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

  return {
    standard: standard.code,
    sourceLanguage: null,
    retrievalQuery: null,
    matches: [],
  };
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
      entry.matches.map((match: any) => ({
        ...match,
        standardCode: entry.standard,
      }))
    ),
  };
}

function parseModelJson(text: string) {
  const trimmed = text.trim();
  const attempts = [
    trimmed,
    trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim(),
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

function normalizeStandardCode(value: unknown) {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (compact === "EN8120") return "EN 81-20";
  if (compact === "EN8150") return "EN 81-50";
  return null;
}

function normalizeClause(value: unknown) {
  const clause = String(value || "").trim();
  return /^\d+(?:\.\d+){1,5}$/.test(clause) ? clause : null;
}

function normalizeEvidenceText(value: unknown) {
  return String(value || "")
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function excerptContainsClause(excerpt: string, clause: string) {
  const pattern = new RegExp(
    `(?:^|[^0-9.])${escapeRegExp(clause)}(?:[^0-9.]|$)`
  );
  return pattern.test(excerpt);
}

function normalizedNumberTokens(value: string) {
  const withoutStandardNames = value.replace(
    /EN\s*81\s*[-–]\s*(?:20|50)/gi,
    ""
  );
  const tokens = withoutStandardNames.match(/\d+(?:[.,]\d+)?/g) || [];
  return tokens.map((token) => token.replace(",", "."));
}

function evidenceContainsAllClaimNumbers(claimText: string, evidenceText: string) {
  const claimNumbers = normalizedNumberTokens(claimText);
  if (!claimNumbers.length) return true;

  const evidenceNumbers = new Set(normalizedNumberTokens(evidenceText));
  return claimNumbers.every((number) => evidenceNumbers.has(number));
}

type VerifiedStandardClaim = {
  standard: "EN 81-20" | "EN 81-50";
  clause: string;
  text: string;
};

function verifyStandardClaims(parsed: any, retrieval: any): VerifiedStandardClaim[] {
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const verified: VerifiedStandardClaim[] = [];

  for (const claim of claims.slice(0, 12)) {
    const standard = normalizeStandardCode(claim?.standard);
    const clause = normalizeClause(claim?.clause);
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    const evidenceQuote =
      typeof claim?.evidenceQuote === "string" ? claim.evidenceQuote.trim() : "";

    if (!standard || !clause || !text || evidenceQuote.length < 12) continue;

    const candidates = (retrieval.matches || []).filter((match: any) => {
      if (match?.standardCode !== standard) return false;
      const excerpt = normalizeEvidenceText(match?.metadata?.text);
      return excerpt.length > 0 && excerptContainsClause(excerpt, clause);
    });

    const normalizedQuote = normalizeEvidenceText(evidenceQuote).toLowerCase();

    const supportingMatch = candidates.find((match: any) => {
      const excerpt = normalizeEvidenceText(match?.metadata?.text);
      const quoteIsVerbatim = excerpt.toLowerCase().includes(normalizedQuote);
      const numbersAreGrounded = evidenceContainsAllClaimNumbers(text, excerpt);
      return quoteIsVerbatim && numbersAreGrounded;
    });

    if (!supportingMatch) continue;

    verified.push({ standard, clause, text });
  }

  return verified;
}

function clauseLabel(language?: string | null) {
  switch (language) {
    case "de":
      return "Abschnitt";
    case "fa":
      return "بند";
    case "tr":
      return "Madde";
    case "ru":
      return "пункт";
    case "ar":
      return "البند";
    case "hr":
      return "odjeljak";
    default:
      return "Clause";
  }
}

function presentationLabels(language?: string | null) {
  switch (language) {
    case "de":
      return { summary: "Kurz gesagt", details: "Was die Norm konkret sagt" };
    case "fa":
      return { summary: "خلاصهٔ فنی", details: "آنچه Norm دقیقاً می‌گوید" };
    case "tr":
      return { summary: "Kısaca", details: "Standardın tam olarak söylediği" };
    default:
      return { summary: "In practical terms", details: "What the standard says exactly" };
  }
}

function formatVerifiedStandardClaims(
  claims: VerifiedStandardClaim[],
  language?: string | null
) {
  const label = clauseLabel(language);
  return claims
    .map(
      (claim) =>
        `- **${claim.standard}, ${label} ${claim.clause}:** ${claim.text}`
    )
    .join("\n");
}

async function buildHumanStandardsSummary(
  question: string,
  claims: VerifiedStandardClaim[],
  language: string | null | undefined,
  apiKey: string
) {
  const verifiedFacts = claims
    .map(
      (claim, index) =>
        `${index + 1}. ${claim.standard} ${claim.clause}: ${claim.text}`
    )
    .join("\n");

  const prompt = `
You are an experienced elevator engineer explaining a standards answer to a colleague in a natural, human way.

Write a short direct answer to the user's question BEFORE the formal clause details are shown.

STRICT RULES:
- Use ONLY the verified facts below.
- Do not add any new requirement, exception, number, dimension, value, interpretation or safety claim that is not already present in those verified facts.
- Do not cite clause numbers in this short explanation; the exact clauses will be shown immediately afterwards.
- Explain what the verified facts mean in practice, like a competent human colleague, not like a legal document or a generic AI disclaimer.
- Keep it to 1-3 short sentences.
- Answer in ${languageName(language || "en")}.
- Do not use a heading, bullets, references or source names.

User question:
${question}

Verified facts:
${verifiedFacts}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 420,
          },
        }),
      }
    );

    if (response.ok) {
      const data: any = await response.json();
      const summary = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim();

      if (summary) return summary;
    }
  } catch (error) {
    console.error("Standards summary error:", error);
  }

  return claims[0]?.text || "";
}

async function formatStandardsAnswer(
  question: string,
  claims: VerifiedStandardClaim[],
  language: string | null | undefined,
  apiKey: string
) {
  const labels = presentationLabels(language);
  const summary = await buildHumanStandardsSummary(
    question,
    claims,
    language,
    apiKey
  );
  const details = formatVerifiedStandardClaims(claims, language);

  return `**${labels.summary}:** ${summary}\n\n**${labels.details}:**\n${details}`;
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

The user asked an elevator standards question. For this v1 engine, both EN 81-20 and EN 81-50 have been checked. Work ONLY from the supplied excerpts.

STRICT CLAIM-LEVEL EVIDENCE RULES:
- Do not use outside knowledge.
- Do not invent or reconstruct requirements from memory.
- Produce separate atomic claims. One claim = one normative requirement.
- Every claim MUST identify the exact standard and exact clause/section number supporting that claim.
- The exact clause/section number MUST appear verbatim in the same supplied excerpt that supports the claim.
- For every claim, include a short evidenceQuote copied VERBATIM from that same excerpt. The evidenceQuote is internal validation data and will never be shown to the user.
- Any numeric value, dimension, distance, force, time, tolerance, illumination value, unit or limit stated in claim.text MUST appear in that supporting excerpt.
- claim.text must contain only the user-facing requirement. Do NOT repeat the standard name, clause number, page number, source name or evidenceQuote inside claim.text.
- Never transfer a clause number, value or requirement from one standard to the other.
- If a point is only an engineering inference and not directly supported, omit it.
- If one standard has no relevant evidence, do not force a claim from it merely because it was checked.
- If the user explicitly named one of the two standards, focus on it; use the other only if it directly adds a relevant verified requirement.
- If you cannot produce at least one fully verified atomic claim, set sufficient=false and return an empty claims array.

LANGUAGE:
- claim.text must be in the same language as the user's question.
- evidenceQuote must remain verbatim in the original source language.

Return ONLY valid JSON:
{
  "sufficient": true | false,
  "claims": [
    {
      "standard": "EN 81-20" | "EN 81-50",
      "clause": "exact clause number such as 5.2.1.4",
      "text": "one user-facing atomic requirement",
      "evidenceQuote": "short verbatim quote copied from the supporting excerpt"
    }
  ]
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
          maxOutputTokens: 2200,
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
  const verifiedClaims = verifyStandardClaims(parsed, retrieval);

  if (!verifiedClaims.length) {
    return { sufficient: false, answer: "" };
  }

  return {
    sufficient: true,
    answer: await formatStandardsAnswer(
      question,
      verifiedClaims,
      route.questionLanguage,
      apiKey
    ),
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

function normalizeWebStandardClaims(parsed: any): VerifiedStandardClaim[] {
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const normalized: VerifiedStandardClaim[] = [];

  for (const claim of claims.slice(0, 12)) {
    const standard = normalizeStandardCode(claim?.standard);
    const clause = normalizeClause(claim?.clause);
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    const evidenceQuote =
      typeof claim?.evidenceQuote === "string" ? claim.evidenceQuote.trim() : "";

    if (!standard || !clause || !text || evidenceQuote.length < 12) continue;
    normalized.push({ standard, clause, text });
  }

  return normalized;
}

function standardsUnverifiedMessage(language?: string | null) {
  switch (language) {
    case "de":
      return "Ich konnte für diese Frage keine Aussage aus EN 81-20 / EN 81-50 mit zuverlässig verifizierter exakter Abschnittsnummer bestätigen. Bitte konkretisiere den Punkt (z. B. Schachtbeleuchtung, Schachtgrube, Schutzraum oder Schachtwand), damit ich gezielter prüfen kann.";
    case "fa":
      return "برای این سؤال نتوانستم مطلبی از EN 81-20 / EN 81-50 را با شماره بند دقیق و قابل‌اعتماد تأیید کنم. لطفاً موضوع را دقیق‌تر کن (مثلاً روشنایی چاه، چاهک، فضای حفاظتی یا دیواره چاه) تا هدفمندتر بررسی کنم.";
    default:
      return "I could not verify an exact EN 81-20 / EN 81-50 clause reliably for this question. Please narrow the topic (for example shaft lighting, pit, refuge space, or shaft wall) so I can check it more precisely.";
  }
}

async function answerStandardsFromWeb(
  question: string,
  route: any,
  apiKey: string
) {
  const prompt = `
You are the standards web-verification fallback of elevator.help.

The internal indexed excerpts were not sufficient. Use Google Search to verify the answer from authoritative standards-related or official technical sources.

STRICT RULES:
- This request concerns EN 81-20 / EN 81-50.
- Produce separate atomic normative claims only. One claim = one requirement.
- EVERY claim must contain the exact standard (EN 81-20 or EN 81-50) AND the exact clause/section number that directly supports that claim.
- Do not provide any general normative sentence, bullet or summary without its own exact standard + exact clause.
- Do not guess clause numbers.
- Do not infer a clause from a nearby topic.
- Any numeric value, dimension, distance, force, time, tolerance, illumination value, unit or limit in claim.text must be directly verified in the search evidence for that same clause.
- For every claim, include a short evidenceQuote copied from the evidence you used. This is internal validation data and will not be shown to the user.
- If you cannot verify the exact clause for a point, omit that point entirely.
- If no exact-clause claims can be verified, return an empty claims array.
- claim.text must be in the same language as the user's question.
- evidenceQuote should stay in the language of the evidence.
- Do not include source URLs, document names, page numbers or a references section in claim.text.

Return ONLY valid JSON:
{
  "claims": [
    {
      "standard": "EN 81-20" | "EN 81-50",
      "clause": "exact clause number such as 5.2.5.5.2.1",
      "text": "one user-facing atomic requirement",
      "evidenceQuote": "short quote from the search evidence supporting this exact claim"
    }
  ]
}

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
          temperature: 0,
          maxOutputTokens: 2200,
        },
      }),
    }
  );

  if (!response.ok) {
    return {
      sufficient: false,
      answer: standardsUnverifiedMessage(route.questionLanguage),
    };
  }

  const data: any = await response.json();
  const candidate = data?.candidates?.[0];
  const raw = candidate?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  const parsed = raw ? parseModelJson(raw) : null;
  const grounded = Boolean(candidate?.groundingMetadata?.groundingChunks?.length);
  const claims = grounded ? normalizeWebStandardClaims(parsed) : [];

  if (!claims.length) {
    return {
      sufficient: false,
      answer: standardsUnverifiedMessage(route.questionLanguage),
    };
  }

  return {
    sufficient: true,
    answer: await formatStandardsAnswer(
      question,
      claims,
      route.questionLanguage,
      apiKey
    ),
  };
}

async function answerFromWeb(question: string, route: any, apiKey: string) {
  const standardsRules = isStandardsQuestion(question, route)
    ? `\nSTANDARDS VERIFICATION RULES:\n- For EN 81-20 / EN 81-50 claims, use authoritative or official technical evidence when available.\n- Every normative requirement you state must identify the exact standard AND exact clause/section number that supports it.\n- Do not state an exact clause number, numeric requirement or limit unless it is directly verified by the search evidence.\n- Do not provide uncited general normative bullet points. Every normative bullet or paragraph must carry its own standard + exact clause.\n- If you cannot verify the exact clause/section for a standards requirement, do not present that requirement as normative. Say that the exact clause could not be verified rather than guessing.\n`
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

    if (isWhyElevatorHelpQuestion(question)) {
      const answer = await answerWhyElevatorHelp(question, apiKey);
      return NextResponse.json({
        answer,
        sources: [],
        mode: "about_elevator_help",
      });
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

      const webResult = await answerStandardsFromWeb(question, route, apiKey);
      return NextResponse.json({
        answer: webResult.answer,
        sources: [],
        mode: webResult.sufficient
          ? "standards_web_fallback"
          : "standards_unverified",
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
      const answer = await answerFromKnowledge(
        question,
        route,
        retrieval,
        apiKey
      );
      return NextResponse.json({
        answer,
        sources: [],
        mode: "knowledge_base",
      });
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
