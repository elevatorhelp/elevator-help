const MIN_STANDARD_SCORE = 0.20;

const CORE_STANDARDS = [
  { code: "EN 81-20", compact: "EN8120" },
  { code: "EN 81-50", compact: "EN8150" },
] as const;

type CoreStandardCode = (typeof CORE_STANDARDS)[number]["code"];

type StandardTopic =
  | "structure"
  | "pit"
  | "headroom"
  | "lighting"
  | "access"
  | "separation"
  | "general";

type VerifiedStandardClaim = {
  standard: CoreStandardCode;
  clause: string;
  text: string;
  topic: StandardTopic;
};

type PlannedQuery = {
  topic: StandardTopic;
  query: string;
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

function parseModelJson(text: string) {
  const trimmed = String(text || "").trim();
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

export function isStandardsQuestion(question: string, route?: any) {
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

function isBroadShaftQuestion(question: string) {
  const hasShaft =
    /\b(schacht|aufzugsschacht|shaft|elevator\s+well|well)\b/i.test(question) ||
    /(چاه\s*آسانسور|چاه آسانسور)/i.test(question);

  if (!hasShaft) return false;

  const specific =
    /(schachtwand|schachtwänd|wand|festigkeit|verform|glas|grube|pit|schachtkopf|headroom|schutzraum|refuge|beleuchtung|lighting|licht|zugang|tür|door|trenn|separation|gegengewicht|counterweight)/i.test(
      question
    ) || /(دیواره|چاهک|بالاسری|روشنایی|درِ|درب|فضای حفاظتی)/i.test(question);

  return !specific;
}

async function translateQuery(
  question: string,
  sourceLanguage: string,
  apiKey: string
) {
  const prompt = `
Translate the following elevator standards search query into concise technical ${languageName(
    sourceLanguage
  )}.

Rules:
- Preserve EN 81-20 and EN 81-50 exactly.
- Preserve the exact technical intent.
- Do not answer the question.
- Return only the translated search query.

Query:
${question}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 250 },
      }),
    }
  );

  if (!response.ok) return question;
  const data: any = await response.json();
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim() || question
  );
}

function deterministicQueryPlan(question: string, sourceLanguage: string) {
  const broadShaft = isBroadShaftQuestion(question);
  const plan: PlannedQuery[] = [{ topic: "general", query: question }];

  if (broadShaft) {
    if (sourceLanguage === "de") {
      plan.push(
        {
          topic: "structure",
          query: "Aufzugsschacht Schachtwände Festigkeit Wände Böden Decken mechanische Festigkeit",
        },
        {
          topic: "structure",
          query: "Schachtwand mechanische Festigkeit Verformung Kraft Glas Verbundsicherheitsglas",
        },
        {
          topic: "structure",
          query: "EN 81-20 5.2.1.8.2 Schachtwände mechanische Festigkeit Verformung",
        },
        {
          topic: "pit",
          query: "Schachtgrube Grubenboden Festigkeit Schutzraum freier Bereich",
        },
        {
          topic: "headroom",
          query: "Schachtkopf Schutzraum Freiraum Fahrkorbdach Abstände",
        },
        {
          topic: "lighting",
          query: "Schachtbeleuchtung elektrische Beleuchtung Beleuchtungsstärke",
        },
        {
          topic: "access",
          query: "Zugang Aufzugsschacht Zugangstüren Nottüren Wartungstüren",
        },
        {
          topic: "separation",
          query: "mehrere Aufzüge gemeinsamer Schacht Trennwand Trennung Gegengewicht",
        }
      );
    } else {
      plan.push(
        {
          topic: "structure",
          query: "elevator shaft walls floors ceilings mechanical strength",
        },
        {
          topic: "structure",
          query: "shaft wall mechanical strength deformation force laminated safety glass",
        },
        {
          topic: "pit",
          query: "elevator pit floor strength refuge space free area",
        },
        {
          topic: "headroom",
          query: "elevator headroom refuge space car roof clearances",
        },
        {
          topic: "lighting",
          query: "elevator shaft electrical lighting illumination",
        },
        {
          topic: "access",
          query: "elevator shaft access inspection emergency maintenance doors",
        },
        {
          topic: "separation",
          query: "multiple lifts common shaft partition counterweight separation",
        }
      );
    }
  } else {
    const q = question.toLowerCase();
    if (/schachtwand|wand|festigkeit|verform|glass|glas|دیواره/i.test(q)) {
      plan.push({
        topic: "structure",
        query:
          sourceLanguage === "de"
            ? "Schachtwände Festigkeit mechanische Festigkeit Verformung Kraft Glas"
            : "shaft walls mechanical strength deformation force glass",
      });
    }
    if (/grube|pit|چاهک/i.test(q)) {
      plan.push({
        topic: "pit",
        query:
          sourceLanguage === "de"
            ? "Schachtgrube Grubenboden Schutzraum freier Bereich"
            : "elevator pit floor refuge space free area",
      });
    }
    if (/schachtkopf|headroom|schutzraum|refuge|بالاسری|فضای حفاظتی/i.test(q)) {
      plan.push({
        topic: "headroom",
        query:
          sourceLanguage === "de"
            ? "Schachtkopf Schutzraum Freiraum Fahrkorbdach Abstände"
            : "headroom refuge space car roof clearances",
      });
    }
    if (/beleuchtung|lighting|licht|روشنایی/i.test(q)) {
      plan.push({
        topic: "lighting",
        query:
          sourceLanguage === "de"
            ? "Schachtbeleuchtung elektrische Beleuchtung Beleuchtungsstärke"
            : "shaft electrical lighting illumination",
      });
    }
    if (/zugang|tür|door|wartung|not.*tür|درب|درِ/i.test(q)) {
      plan.push({
        topic: "access",
        query:
          sourceLanguage === "de"
            ? "Zugang Aufzugsschacht Zugangstüren Nottüren Wartungstüren"
            : "shaft access inspection emergency maintenance doors",
      });
    }
    if (/trenn|separation|mehrere aufzüge|multiple lifts|مشترک/i.test(q)) {
      plan.push({
        topic: "separation",
        query:
          sourceLanguage === "de"
            ? "mehrere Aufzüge gemeinsamer Schacht Trennwand Trennung"
            : "multiple lifts common shaft partition separation",
      });
    }
  }

  return plan;
}

async function expandQueryPlan(
  question: string,
  route: any,
  sourceLanguage: string,
  apiKey: string
) {
  const translated =
    route.questionLanguage === sourceLanguage
      ? question
      : await translateQuery(question, sourceLanguage, apiKey);

  const plan = deterministicQueryPlan(translated, sourceLanguage);
  const topicHints = [...(route.topics || []), ...(route.components || [])]
    .filter(Boolean)
    .slice(0, 8);

  const prompt = `
Create 3 to 5 additional semantic-search queries for an elevator standards archive.

User question:
${translated}

Router hints:
${JSON.stringify(topicHints)}

Rules:
- Write queries in ${languageName(sourceLanguage)}.
- Keep the exact subject and intent.
- Use terminology likely to appear in EN 81-20 / EN 81-50.
- Do not invent clause numbers or numeric requirements.
- Assign each query one topic from: structure, pit, headroom, lighting, access, separation, general.
- Return only valid JSON: {"queries":[{"topic":"general","query":"..."}]}
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
            maxOutputTokens: 550,
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
        for (const item of parsed.queries) {
          const query = typeof item?.query === "string" ? item.query.trim() : "";
          const topic = String(item?.topic || "general") as StandardTopic;
          if (
            query.length > 3 &&
            ["structure", "pit", "headroom", "lighting", "access", "separation", "general"].includes(
              topic
            )
          ) {
            plan.push({ topic, query });
          }
        }
      }
    }
  } catch (error) {
    console.error("Standards query expansion error:", error);
  }

  const seen = new Set<string>();
  return plan.filter((item) => {
    const key = `${item.topic}:${item.query.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
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

function matchKey(match: any) {
  const metadata = match?.metadata || {};
  return String(
    match?.id ||
      `${metadata.sourceFileId || metadata.fileName || "file"}:${
        metadata.page || "p"
      }:${metadata.chunkIndex || "c"}`
  );
}

function matchRank(match: any) {
  const text = String(match?.metadata?.text || "");
  const clauseBonus = /\b\d+(?:\.\d+){2,6}\b/.test(text) ? 0.18 : 0;
  const headingBonus = /(schacht|shaft|grube|pit|schachtkopf|headroom|beleuchtung|lighting|zugang|access|festigkeit|strength)/i.test(
    text
  )
    ? 0.05
    : 0;
  return Number(match?.score || 0) + clauseBonus + headingBonus;
}

function inferTopicFromMapMetadata(metadata: any): StandardTopic {
  const text = `${metadata?.topics || ""} ${metadata?.sectionTitle || ""} ${metadata?.text || ""}`.toLowerCase();
  if (/(schachtwand|shaft wall|festigkeit|strength|structure|wand|wall)/i.test(text)) return "structure";
  if (/(schachtgrube|pit|grube)/i.test(text)) return "pit";
  if (/(schachtkopf|headroom|schutzraum|refuge)/i.test(text)) return "headroom";
  if (/(beleuchtung|lighting|illumination|licht)/i.test(text)) return "lighting";
  if (/(zugang|access|wartungstür|nottür|inspection door|emergency door)/i.test(text)) return "access";
  if (/(trenn|separation|partition|gegengewicht|counterweight)/i.test(text)) return "separation";
  return "general";
}

function mapMatchToQuery(match: any, standard: (typeof CORE_STANDARDS)[number]): PlannedQuery | null {
  const metadata = match?.metadata || {};
  if (metadata.contentType !== "document-map") return null;
  if (!matchBelongsToStandard(match, standard.compact)) return null;

  const parts = [
    metadata.sectionId ? `${standard.code} ${metadata.sectionId}` : standard.code,
    metadata.sectionTitle || "",
    metadata.topics || "",
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (parts.length < 2) return null;
  return { topic: inferTopicFromMapMetadata(metadata), query: parts.join(" ") };
}

async function discoverMapQueries(
  question: string,
  standard: (typeof CORE_STANDARDS)[number],
  ai: any,
  vectorize: any
) {
  try {
    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: [`${question}\n${standard.code}`],
    });
    const queryVector = (embeddingResult as any).data?.[0];
    if (!queryVector) return [] as PlannedQuery[];

    let matches: any[] = [];
    try {
      const filtered = await vectorize.query(queryVector, {
        topK: 30,
        returnMetadata: "all",
        filter: { contentType: "document-map" },
      });
      matches = filtered.matches || [];
    } catch (error) {
      console.error("Standards document-map metadata filter failed; using local filtering", {
        standard: standard.code,
        message: error instanceof Error ? error.message : String(error),
      });
      const unfiltered = await vectorize.query(queryVector, {
        topK: 50,
        returnMetadata: "all",
      });
      matches = (unfiltered.matches || []).filter(
        (match: any) => match?.metadata?.contentType === "document-map"
      );
    }

    const seen = new Set<string>();
    const queries: PlannedQuery[] = [];
    for (const match of matches) {
      const query = mapMatchToQuery(match, standard);
      if (!query) continue;
      const key = `${query.topic}:${query.query.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(query);
      if (queries.length >= 6) break;
    }
    return queries;
  } catch (error) {
    console.error("Standards map discovery error:", {
      standard: standard.code,
      message: error instanceof Error ? error.message : String(error),
    });
    return [] as PlannedQuery[];
  }
}

async function rawMatchesForQuery(
  item: PlannedQuery,
  standard: (typeof CORE_STANDARDS)[number],
  sourceLanguage: string,
  ai: any,
  vectorize: any
) {
  const retrievalQuery = `${item.query}\n${standard.code}`;
  const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
    text: [retrievalQuery],
  });
  const queryVector = (embeddingResult as any).data?.[0];
  if (!queryVector) return [];

  const exactClauseQuery = /\b\d+(?:\.\d+){2,6}\b/.test(item.query);
  const minimumScore = exactClauseQuery ? 0.12 : MIN_STANDARD_SCORE;

  const queryWithFilter = async (filter?: Record<string, string>) => {
    try {
      const result = await vectorize.query(queryVector, {
        topK: 50,
        returnMetadata: "all",
        ...(filter ? { filter } : {}),
      });

      return (result.matches || [])
        .filter(
          (match: any) =>
            match?.metadata?.contentType !== "document-map" &&
            typeof match?.metadata?.text === "string" &&
            match.metadata.text.trim().length > 0 &&
            matchBelongsToStandard(match, standard.compact) &&
            Number(match?.score || 0) >= minimumScore
        )
        .sort((a: any, b: any) => matchRank(b) - matchRank(a))
        .slice(0, 6)
        .map((match: any) => ({
          ...match,
          standardSearchTopic: item.topic,
          standardSearchQuery: item.query,
        }));
    } catch (error) {
      if (filter) {
        console.error("Standards metadata-filter query failed; falling back safely", {
          filter,
          standard: standard.code,
          message: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
      throw error;
    }
  };

  // Prefer raw vectors explicitly classified as standards so unrelated manuals do
  // not consume the nearest-neighbour window. Document-map nodes only guide the
  // query plan and can never become normative evidence.
  const standardMatches = await queryWithFilter({ contentType: "standard" });
  if (standardMatches.length) return standardMatches;

  const languageMatches = await queryWithFilter({ language: sourceLanguage });
  if (languageMatches.length) return languageMatches;

  // Legacy/raw standards vectors may not have reliable enrichment metadata.
  // Falling back to an unfiltered search is safe because final claims still
  // require exact standard membership, an exact clause in the raw excerpt and a
  // verbatim evidence quote from that same raw excerpt.
  return queryWithFilter();
}

async function queryOneStandard(
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
    new Set([preferredLanguage, "de", "de-en", "en"].filter(Boolean))
  );
  const mapQueries = await discoverMapQueries(question, standard, ai, vectorize);

  for (const sourceLanguage of languages) {
    const basePlan = await expandQueryPlan(question, route, sourceLanguage, apiKey);
    const plan = [...mapQueries, ...basePlan].filter((item, index, all) => {
      const key = `${item.topic}:${item.query.toLowerCase()}`;
      return all.findIndex((candidate) => `${candidate.topic}:${candidate.query.toLowerCase()}` === key) === index;
    }).slice(0, 14);
    const perTopic = new Map<StandardTopic, any[]>();

    for (const item of plan) {
      const valid = await rawMatchesForQuery(item, standard, sourceLanguage, ai, vectorize);

      const current = perTopic.get(item.topic) || [];
      const byKey = new Map(current.map((match: any) => [matchKey(match), match]));
      for (const match of valid) {
        const key = matchKey(match);
        const existing = byKey.get(key);
        if (!existing || matchRank(match) > matchRank(existing)) byKey.set(key, match);
      }
      perTopic.set(
        item.topic,
        [...byKey.values()]
          .sort((a: any, b: any) => matchRank(b) - matchRank(a))
          .slice(0, 4)
      );
    }

    const broad = isBroadShaftQuestion(question);
    const topicOrder: StandardTopic[] = broad
      ? ["structure", "pit", "headroom", "lighting", "access", "separation", "general"]
      : ["general", "structure", "pit", "headroom", "lighting", "access", "separation"];

    const selected: any[] = [];
    const used = new Set<string>();
    const perTopicLimit = broad ? 2 : 3;

    for (const topic of topicOrder) {
      for (const match of (perTopic.get(topic) || []).slice(0, perTopicLimit)) {
        const key = matchKey(match);
        if (used.has(key)) continue;
        used.add(key);
        selected.push(match);
      }
    }

    if (selected.length) {
      return {
        standard: standard.code,
        sourceLanguage,
        broad,
        matches: selected.slice(0, broad ? 14 : 12),
      };
    }
  }

  return {
    standard: standard.code,
    sourceLanguage: null,
    broad: isBroadShaftQuestion(question),
    matches: [],
  };
}

async function retrieveStandards(
  question: string,
  route: any,
  apiKey: string,
  ai: any,
  vectorize: any
) {
  const checked = await Promise.all(
    CORE_STANDARDS.map(async (standard) => {
      try {
        return await queryOneStandard(
          question,
          route,
          standard,
          apiKey,
          ai,
          vectorize
        );
      } catch (error) {
        console.error("Standards retrieval error:", {
          standard: standard.code,
          message: error instanceof Error ? error.message : String(error),
        });
        return {
          standard: standard.code,
          sourceLanguage: null,
          broad: isBroadShaftQuestion(question),
          matches: [],
        };
      }
    })
  );

  return {
    checkedStandards: CORE_STANDARDS.map((standard) => standard.code),
    explicitlyNamed: explicitlyNamedCoreStandards(question),
    broad: isBroadShaftQuestion(question),
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

function normalizeTopic(value: unknown): StandardTopic {
  const topic = String(value || "general") as StandardTopic;
  return ["structure", "pit", "headroom", "lighting", "access", "separation", "general"].includes(
    topic
  )
    ? topic
    : "general";
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

function verifyClaims(parsed: any, evidence: any[]): VerifiedStandardClaim[] {
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const verified: VerifiedStandardClaim[] = [];
  const seen = new Set<string>();

  for (const claim of claims.slice(0, 18)) {
    const standard = normalizeStandardCode(claim?.standard);
    const clause = normalizeClause(claim?.clause);
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    const evidenceQuote =
      typeof claim?.evidenceQuote === "string" ? claim.evidenceQuote.trim() : "";
    const evidenceId = Number(claim?.evidenceId);
    const topic = normalizeTopic(claim?.topic);

    if (
      !standard ||
      !clause ||
      !text ||
      evidenceQuote.length < 10 ||
      !Number.isInteger(evidenceId) ||
      evidenceId < 1
    ) {
      continue;
    }

    const selected = evidence[evidenceId - 1];
    if (!selected || selected.standardCode !== standard) continue;

    const excerpt = normalizeEvidenceText(selected?.metadata?.text);
    if (!excerpt || !excerptContainsClause(excerpt, clause)) continue;

    const normalizedQuote = normalizeEvidenceText(evidenceQuote).toLowerCase();
    if (!excerpt.toLowerCase().includes(normalizedQuote)) continue;
    if (!evidenceContainsAllClaimNumbers(text, excerpt)) continue;

    const key = `${standard}:${clause}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    verified.push({ standard, clause, text, topic });
  }

  return verified;
}

function selectClaimsForAnswer(
  claims: VerifiedStandardClaim[],
  broad: boolean
) {
  if (!broad) return claims.slice(0, 8);

  const topicOrder: StandardTopic[] = [
    "structure",
    "pit",
    "headroom",
    "lighting",
    "access",
    "separation",
    "general",
  ];
  const selected: VerifiedStandardClaim[] = [];
  const usedClauses = new Set<string>();

  for (const topic of topicOrder) {
    const claim = claims.find(
      (item) => item.topic === topic && !usedClauses.has(`${item.standard}:${item.clause}`)
    );
    if (!claim) continue;
    selected.push(claim);
    usedClauses.add(`${claim.standard}:${claim.clause}`);
  }

  return selected.slice(0, 6);
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

function cleanHumanSummary(summary: string) {
  const normalized = String(summary || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const cut = normalized.search(
    /(?:\bEN\s*81\s*[-–]|\bAbschnitt\s+\d|\bClause\s+\d|\bMadde\s+\d|\bпункт\s+\d|\bالبند\s+\d)/i
  );
  const cleaned = (cut >= 0 ? normalized.slice(0, cut) : normalized)
    .replace(/[\s:;,-]+$/g, "")
    .trim();

  return cleaned;
}

async function buildHumanSummary(
  question: string,
  claims: VerifiedStandardClaim[],
  language: string | null | undefined,
  apiKey: string
) {
  const factsOnly = claims.map((claim) => claim.text).join("\n");
  const prompt = `
You are an experienced elevator engineer answering a colleague naturally.

Write ONLY a short direct practical summary of the verified facts below.

Rules:
- Use only these verified facts.
- Do not mention EN 81, a standard name, a clause number, a section number, a page, a source or a reference.
- Do not repeat the formal bullet list.
- Do not add requirements, numbers, exceptions or interpretations that are not already in the verified facts.
- Keep it to 1 or 2 natural sentences.
- Answer in ${languageName(language || "en")}.
- Return only the summary text, nothing else.

User question:
${question}

Verified facts:
${factsOnly}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.12, maxOutputTokens: 260 },
        }),
      }
    );

    if (response.ok) {
      const data: any = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim();
      const cleaned = cleanHumanSummary(raw || "");
      if (cleaned.length >= 20) return cleaned;
    }
  } catch (error) {
    console.error("Standards summary error:", error);
  }

  return claims.slice(0, 2).map((claim) => claim.text).join(" ");
}

function formatClaimDetails(
  claims: VerifiedStandardClaim[],
  language?: string | null
) {
  const label = clauseLabel(language);
  return claims
    .map((claim) => `• ${claim.standard}, ${label} ${claim.clause} — ${claim.text}`)
    .join("\n");
}

async function formatAnswer(
  question: string,
  claims: VerifiedStandardClaim[],
  language: string | null | undefined,
  apiKey: string
) {
  const labels = presentationLabels(language);
  const summary = await buildHumanSummary(question, claims, language, apiKey);
  const details = formatClaimDetails(claims, language);
  return `${labels.summary}:\n${summary}\n\n${labels.details}:\n${details}`;
}

function unverifiedMessage(language?: string | null) {
  switch (language) {
    case "de":
      return "Ich habe EN 81-20 und EN 81-50 in der internen technischen Bibliothek geprüft, konnte für diese Formulierung aber noch keinen ausreichend sicheren Abschnittstreffer verifizieren. Formuliere den Punkt bitte etwas konkreter, z. B. Schachtwand, Schachtgrube, Schachtkopf oder Beleuchtung.";
    case "fa":
      return "EN 81-20 و EN 81-50 را در کتابخانهٔ فنی داخلی بررسی کردم، اما برای این عبارت هنوز نتوانستم بند دقیقی را با اطمینان کافی تأیید کنم. موضوع را کمی دقیق‌تر بگو؛ مثلاً دیوارهٔ چاه، چاهک، بالاسری یا روشنایی چاه.";
    default:
      return "I checked EN 81-20 and EN 81-50 in the internal technical library, but I could not verify a sufficiently reliable exact clause for this wording. Please narrow the point slightly, for example shaft wall, pit, headroom or shaft lighting.";
  }
}

export async function answerStandardsQuestion(
  question: string,
  route: any,
  apiKey: string,
  ai: any,
  vectorize: any
) {
  const retrieval = await retrieveStandards(question, route, apiKey, ai, vectorize);
  const checkedStandards = retrieval.checkedStandards;

  if (!retrieval.matches.length) {
    return {
      sufficient: false,
      answer: unverifiedMessage(route.questionLanguage),
      checkedStandards,
    };
  }

  // Preserve diversified retrieval order. Do not globally rerank here, because
  // a broad question must not be dominated by one narrow subtopic.
  // Document-map nodes are deliberately excluded upstream: they can guide
  // retrieval but they can never serve as normative evidence.
  const evidence = retrieval.matches.slice(0, retrieval.broad ? 24 : 18);
  const excerpts = evidence
    .map((match: any, index: number) => {
      const metadata = match.metadata || {};
      return `EVIDENCE ${index + 1}\nSTANDARD: ${match.standardCode}\nTOPIC: ${
        match.standardSearchTopic || "general"
      }\nEXCERPT:\n${metadata.text}`;
    })
    .join("\n\n");

  const prompt = `
You are the standards evidence layer of elevator.help.
Both EN 81-20 and EN 81-50 were searched in the internal indexed standards library.
Work ONLY from the supplied excerpts.

STRICT CLAIM RULES:
- Do not use outside or web knowledge.
- Do not invent or reconstruct requirements from memory.
- One claim = one normative requirement.
- Every claim must identify the exact standard and exact clause number.
- The exact clause number must appear verbatim in the same evidence excerpt.
- Every claim must include evidenceId pointing to that exact EVIDENCE item.
- Every claim must include a short evidenceQuote copied verbatim from that excerpt.
- Every numeric value, dimension, distance, force, time, tolerance, illumination value, unit or limit in claim.text must appear in the same excerpt.
- Preserve conditions, alternatives and exceptions that materially change the requirement. Never turn a conditional or exception-based requirement into an unconditional statement.
- If the excerpt is incomplete, cross-referenced in a way that changes the meaning, or contains exceptions you cannot safely preserve in one atomic claim, omit that claim.
- claim.text must contain only the user-facing requirement, not the standard name or clause number.
- topic must match the EVIDENCE TOPIC.
- If one standard has no relevant evidence, do not force it into the answer.
- If the user's question is broad, cover different relevant topics rather than returning several claims from only one narrow topic.
- For a broad shaft question, prioritize structure/shaft walls first, then pit, headroom, lighting, access and separation when verified evidence exists.

LANGUAGE:
- claim.text must be in the same language as the user's question.
- evidenceQuote remains verbatim in the source language.

Return ONLY valid JSON:
{
  "claims": [
    {
      "standard": "EN 81-20" | "EN 81-50",
      "clause": "exact clause number",
      "topic": "structure" | "pit" | "headroom" | "lighting" | "access" | "separation" | "general",
      "text": "one precise user-facing requirement preserving relevant conditions",
      "evidenceId": 1,
      "evidenceQuote": "short verbatim quote"
    }
  ]
}

User question:
${question}

Explicitly named standards:
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
          maxOutputTokens: 3000,
        },
      }),
    }
  );

  if (!response.ok) {
    return {
      sufficient: false,
      answer: unverifiedMessage(route.questionLanguage),
      checkedStandards,
    };
  }

  const data: any = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();
  const parsed = raw ? parseModelJson(raw) : null;
  const verified = verifyClaims(parsed, evidence);
  const selected = selectClaimsForAnswer(verified, retrieval.broad);

  if (!selected.length) {
    return {
      sufficient: false,
      answer: unverifiedMessage(route.questionLanguage),
      checkedStandards,
    };
  }

  return {
    sufficient: true,
    answer: await formatAnswer(question, selected, route.questionLanguage, apiKey),
    checkedStandards,
  };
}
