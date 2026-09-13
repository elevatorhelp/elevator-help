import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextRequest, NextResponse } from "next/server";
import { routeQuestion } from "../../lib/router";

const SOURCE_LANGUAGE_FALLBACKS = ["de", "en"];
const MIN_SEMANTIC_SCORE = 0.72;
const MIN_STANDARD_SCORE = 0.34;

const CORE_STANDARDS = [
  { code: "EN 81-20", compact: "EN8120" },
  { code: "EN 81-50", compact: "EN8150" },
] as const;

type CoreStandardCode = (typeof CORE_STANDARDS)[number]["code"];

type VerifiedStandardClaim = {
  standard: CoreStandardCode;
  clause: string;
  text: string;
};

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

function isContactQuestion(question: string) {
  return /(contact|email|e-mail|kontakt|erreichen|تماس|ایمیل)/i.test(question) &&
    /(elevator\.help|you|euch|dich|شما|سایت)/i.test(question);
}

function isAdvertisingQuestion(question: string) {
  return /(advertis|werbung|anzeige|تبلیغ|آگهی)/i.test(question);
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
  )} for semantic search in elevator manuals and standards.

Rules:
- Preserve the exact technical meaning.
- Preserve manufacturer names, controller names, fault families and fault codes exactly.
- Preserve standard identifiers such as EN 81-20 and EN 81-50 exactly.
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
      ) value += 10;
      if (
        route.faultName &&
        (route.confidence === "high" || route.confidence === "medium") &&
        String(metadata.faultName || "").toUpperCase() ===
          String(route.faultName).toUpperCase()
      ) value += 5;
      if (
        route.faultFamily &&
        String(metadata.faultFamily || "").toUpperCase() ===
          String(route.faultFamily).toUpperCase()
      ) value += 1;
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

function deterministicStandardQueries(question: string, sourceLanguage: string) {
  const normalized = question.toLowerCase();
  const queries: string[] = [question];
  const shaftQuestion =
    /\b(schacht|schachtwand|schachtwände|shaft|well)\b/i.test(question) ||
    /(چاه|چاهک|دیواره.*چاه)/i.test(question);

  if (shaftQuestion) {
    if (sourceLanguage === "de") {
      queries.push(
        "Aufzugsschacht Schachtwände Festigkeit Wände Böden Decken",
        "Schachtwand mechanische Festigkeit Verformung Kraft",
        "Schachtgrube Boden Festigkeit Führungsschienen",
        "Schachtkopf Schutzraum Freiraum",
        "Schachtbeleuchtung elektrische Beleuchtung",
        "Zugang Schacht Wartungstüren Nottüren"
      );
    } else {
      queries.push(
        "elevator shaft walls floors ceilings mechanical strength",
        "shaft wall mechanical strength deformation force",
        "pit floor guide rails strength",
        "headroom refuge space clearances",
        "shaft electrical lighting",
        "shaft access inspection emergency doors"
      );
    }
  }

  if (/beleuchtung|lighting|نور|روشنایی/i.test(normalized)) {
    queries.push(
      sourceLanguage === "de"
        ? "Schachtbeleuchtung Beleuchtungsstärke elektrische Beleuchtung"
        : "shaft lighting illumination electrical lighting"
    );
  }

  if (/grube|pit|چاهک/i.test(normalized)) {
    queries.push(
      sourceLanguage === "de"
        ? "Schachtgrube Grubenboden Schutzraum Zugang"
        : "elevator pit floor refuge space access"
    );
  }

  return queries;
}

async function expandStandardQueries(
  question: string,
  route: any,
  sourceLanguage: string,
  apiKey: string
) {
  const translated =
    route.questionLanguage === sourceLanguage
      ? question
      : await translateRetrievalQuery(question, sourceLanguage, apiKey);

  const base = deterministicStandardQueries(translated, sourceLanguage);
  const topicHints = [...(route.topics || []), ...(route.components || [])]
    .filter(Boolean)
    .slice(0, 8);

  const prompt = `
Create semantic-search query expansions for an elevator standards archive.

User question:
${translated}

Router topic hints:
${JSON.stringify(topicHints)}

Rules:
- Write all queries in ${languageName(sourceLanguage)}.
- Keep the user's exact subject and intent.
- Generate 4 to 6 concise technical search queries using likely terminology and synonyms found in EN 81-20 / EN 81-50.
- For broad topics, split into useful subtopics. Example: a broad shaft question may need terms for shaft walls, pit, headroom/refuge space, lighting and access.
- Do NOT answer the question.
- Do NOT invent clause numbers.
- Do NOT invent numeric requirements.
- Return only valid JSON: {"queries":["...","..."]}
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
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (response.ok) {
      const data: any = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim();
      const parsed = raw ? parseModelJson(raw) : null;
      if (Array.isArray(parsed?.queries)) {
        base.push(
          ...parsed.queries.filter(
            (query: unknown) => typeof query === "string" && query.trim().length > 3
          )
        );
      }
    }
  } catch (error) {
    console.error("Standards query expansion error:", error);
  }

  return Array.from(
    new Set(base.map((query) => String(query).trim()).filter(Boolean))
  ).slice(0, 8);
}

function standardMatchKey(match: any) {
  const metadata = match?.metadata || {};
  return String(
    match?.id ||
      `${metadata.sourceFileId || metadata.fileName || "file"}:${
        metadata.page || "p"
      }:${metadata.chunkIndex || "c"}`
  );
}

function standardMatchRank(match: any) {
  const text = String(match?.metadata?.text || "");
  const clauseBonus = /\b\d+(?:\.\d+){2,6}\b/.test(text) ? 0.16 : 0;
  return Number(match?.score || 0) + clauseBonus;
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
    const queries = await expandStandardQueries(
      question,
      route,
      sourceLanguage,
      apiKey
    );
    const collected = new Map<string, any>();

    for (const searchQuery of queries) {
      const retrievalQuery = `${searchQuery}\n${standard.code}`;
      const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
        text: [retrievalQuery],
      });
      const queryVector = (embeddingResult as any).data?.[0];
      if (!queryVector) continue;

      const result = await vectorize.query(queryVector, {
        topK: 40,
        returnMetadata: "all",
        // Do not require contentType="standard" here. Some already-indexed
        // standards chunks may have been classified differently during enrichment.
        filter: { language: sourceLanguage },
      });

      for (const match of result.matches || []) {
        if (
          typeof match?.metadata?.text !== "string" ||
          !match.metadata.text.trim() ||
          !matchBelongsToStandard(match, standard.compact) ||
          Number(match?.score || 0) < MIN_STANDARD_SCORE
        ) {
          continue;
        }

        const key = standardMatchKey(match);
        const existing = collected.get(key);
        if (!existing || standardMatchRank(match) > standardMatchRank(existing)) {
          collected.set(key, match);
        }
      }
    }

    const matches = [...collected.values()]
      .sort((a, b) => standardMatchRank(b) - standardMatchRank(a))
      .slice(0, 12);

    if (matches.length) {
      return {
        standard: standard.code,
        sourceLanguage,
        queries,
        matches,
      };
    }
  }

  return {
    standard: standard.code,
    sourceLanguage: null,
    queries: [],
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
  const checked = await Promise.all(
    CORE_STANDARDS.map((standard) =>
      queryOneCoreStandard(question, route, standard, apiKey, ai, vectorize)
    )
  );

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

function normalizeStandardCode(value: unknown): CoreStandardCode | null {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (compact === "EN8120") return "EN 81-20";
  if (compact === "EN8150") return "EN 81-50";
  return null;
}

function normalizeClause(value: unknown) {
  const clause = String(value || "").trim();
  return /^\d+(?:\.\d+){1,6}$/.test(clause) ? clause : null;
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
  return new RegExp(
    `(?:^|[^0-9.])${escapeRegExp(clause)}(?:[^0-9.]|$)`
  ).test(excerpt);
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

function verifyStandardClaims(parsed: any, retrieval: any): VerifiedStandardClaim[] {
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const verified: VerifiedStandardClaim[] = [];

  for (const claim of claims.slice(0, 16)) {
    const standard = normalizeStandardCode(claim?.standard);
    const clause = normalizeClause(claim?.clause);
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    const evidenceQuote =
      typeof claim?.evidenceQuote === "string" ? claim.evidenceQuote.trim() : "";
    const evidenceId = Number(claim?.evidenceId);

    if (
      !standard ||
      !clause ||
      !text ||
      evidenceQuote.length < 10 ||
      !Number.isInteger(evidenceId) ||
      evidenceId < 1
    ) continue;

    const selected = retrieval.matches?.[evidenceId - 1];
    if (!selected || selected.standardCode !== standard) continue;

    const excerpt = normalizeEvidenceText(selected?.metadata?.text);
    if (!excerpt || !excerptContainsClause(excerpt, clause)) continue;

    const normalizedQuote = normalizeEvidenceText(evidenceQuote).toLowerCase();
    if (!excerpt.toLowerCase().includes(normalizedQuote)) continue;
    if (!evidenceContainsAllClaimNumbers(text, excerpt)) continue;

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
        `• ${claim.standard}, ${label} ${claim.clause} — ${claim.text}`
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

Write a short direct answer to the user's question BEFORE the formal clause details.

STRICT RULES:
- Use ONLY the verified facts below.
- Do not add any new requirement, exception, number, dimension, value or safety claim.
- Do not cite clause numbers in this short explanation; the exact clauses are shown afterwards.
- Explain what the verified facts mean in practice, like a competent human colleague.
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
          generationConfig: { temperature: 0.15, maxOutputTokens: 420 },
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
  return `${labels.summary}:\n${summary}\n\n${labels.details}:\n${details}`;
}

function standardsUnverifiedMessage(language?: string | null) {
  switch (language) {
    case "de":
      return "Ich habe EN 81-20 und EN 81-50 in der internen technischen Bibliothek geprüft, konnte für diese Formulierung aber noch keinen ausreichend sicheren Abschnittstreffer verifizieren. Formuliere den Punkt gern etwas konkreter, z. B. Schachtwand, Schachtgrube, Schachtkopf oder Beleuchtung.";
    case "fa":
      return "EN 81-20 و EN 81-50 را در کتابخانهٔ فنی داخلی بررسی کردم، اما برای این عبارت هنوز نتوانستم بند دقیقی را با اطمینان کافی تأیید کنم. موضوع را کمی دقیق‌تر بگو؛ مثلاً دیوارهٔ چاه، چاهک، بالاسری یا روشنایی چاه.";
    default:
      return "I checked EN 81-20 and EN 81-50 in the internal technical library, but I could not yet verify a sufficiently reliable exact clause for this wording. Please narrow the point slightly, for example shaft wall, pit, headroom or shaft lighting.";
  }
}

async function answerFromStandards(
  question: string,
  route: any,
  retrieval: any,
  apiKey: string
) {
  if (!retrieval.matches.length) return { sufficient: false, answer: "" };

  const rankedEvidence = retrieval.matches
    .sort((a: any, b: any) => standardMatchRank(b) - standardMatchRank(a))
    .slice(0, 20);

  const excerpts = rankedEvidence
    .map((match: any, index: number) => {
      const metadata = match.metadata || {};
      return `EVIDENCE ${index + 1}\nSTANDARD: ${match.standardCode}\nEXCERPT:\n${metadata.text}`;
    })
    .join("\n\n");

  // Keep the exact evidence order used by the model so evidenceId can be validated.
  const validationRetrieval = { ...retrieval, matches: rankedEvidence };

  const prompt = `
You are the standards evidence layer of elevator.help.
Both EN 81-20 and EN 81-50 were searched in the internal indexed standards library.
Work ONLY from the supplied excerpts.

STRICT CLAIM-LEVEL RULES:
- Do not use outside knowledge or web knowledge.
- Do not invent or reconstruct requirements from memory.
- Produce separate atomic claims. One claim = one normative requirement.
- Every claim MUST identify the exact standard and exact clause/section number supporting that claim.
- The exact clause number MUST appear verbatim in the same evidence excerpt.
- Every claim MUST include evidenceId pointing to the exact EVIDENCE number used.
- Every claim MUST include a short evidenceQuote copied VERBATIM from that same evidence excerpt.
- Any numeric value, dimension, distance, force, time, tolerance, illumination value, unit or limit in claim.text MUST appear in that evidence excerpt.
- claim.text must contain only the user-facing requirement; do not repeat standard, clause, source or evidence labels inside it.
- Never transfer a clause number, value or requirement from one standard to the other.
- Omit anything that is only an inference.
- If one standard has no relevant evidence, do not force it into the answer.
- If no fully verified atomic claim can be produced, return an empty claims array.

LANGUAGE:
- claim.text must be in the same language as the user's question.
- evidenceQuote must remain verbatim in the source language.

Return ONLY valid JSON:
{
  "claims": [
    {
      "standard": "EN 81-20" | "EN 81-50",
      "clause": "exact clause number",
      "text": "one user-facing atomic requirement",
      "evidenceId": 1,
      "evidenceQuote": "short verbatim quote"
    }
  ]
}

User question:
${question}

Router context:
${JSON.stringify(route)}

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
          maxOutputTokens: 2600,
        },
      }),
    }
  );

  if (!response.ok) return { sufficient: false, answer: "" };
  const data: any = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  const parsed = raw ? parseModelJson(raw) : null;
  const verifiedClaims = verifyStandardClaims(parsed, validationRetrieval);
  if (!verifiedClaims.length) return { sufficient: false, answer: "" };

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
At the end, add one brief service notice in the user's language. Authorized service technicians should verify the procedure against their company's current technical documentation. Independent service providers should contact the original manufacturer for manufacturer-specific procedures, software or restricted technical information.
`;
}

const ANSWER_VISIBILITY_RULES = `
SOURCE VISIBILITY RULES:
- Use sources internally for grounding, but do not expose or list them to the user.
- Do not name websites, manuals, files, page numbers, storage locations or internal identifiers merely to prove the answer.
- Do not add a Sources or References section.
- For standards, an exact standard designation and exact clause number may be shown inline only when verified.
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
      return `SOURCE ${index + 1}\nManufacturer: ${metadata.manufacturer || "unknown"}\nController: ${metadata.controller || "unknown"}\nFault family: ${metadata.faultFamily || "unknown"}\nFault code: ${metadata.faultCode || "unknown"}\nFault name: ${metadata.faultName || "unknown"}\nExcerpt: ${metadata.text}`;
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
  if (language === "de") return "Die Anfrage konnte gerade nicht zuverlässig verarbeitet werden. Bitte versuche es noch einmal.";
  if (language === "fa") return "در حال حاضر نتوانستم درخواست را با اطمینان پردازش کنم. لطفاً دوباره امتحان کن.";
  return "I could not process the request reliably just now. Please try again.";
}

export async function POST(request: NextRequest) {
  let detectedLanguage: string | null = null;

  try {
    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Please enter a question." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI is not configured." }, { status: 500 });
    }

    if (isAdvertisingQuestion(question)) {
      return NextResponse.json({
        answer: "For advertising inquiries, please contact info@elevator.help.",
        sources: [],
        mode: "contact",
      });
    }

    if (isContactQuestion(question)) {
      return NextResponse.json({
        answer: "You can contact elevator.help at info@elevator.help.",
        sources: [],
        mode: "contact",
      });
    }

    if (isWhyElevatorHelpQuestion(question)) {
      const answer = await answerWhyElevatorHelp(question, apiKey);
      return NextResponse.json({ answer, sources: [], mode: "about_elevator_help" });
    }

    const route = await routeQuestion(question);
    detectedLanguage = route.questionLanguage;
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

      // Standards are intentionally internal-library-first and internal-only in v1.
      // Do not silently switch to public web search for EN 81-20 / EN 81-50.
      return NextResponse.json({
        answer: standardsUnverifiedMessage(route.questionLanguage),
        sources: [],
        mode: "standards_unverified",
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

    const answer = await answerFromWeb(question, route, apiKey);
    return NextResponse.json({ answer, sources: [], mode: "web_fallback" });
  } catch (error) {
    console.error("Ask API error:", error);
    return NextResponse.json(
      { error: safeErrorMessage(detectedLanguage) },
      { status: 500 }
    );
  }
}
