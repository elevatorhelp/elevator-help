import type { FetchLike } from "./gemini-cost-control.ts";
import {
  createQueryBackends,
  type MultilingualRetrieval,
} from "./retrieval-backend.ts";
import {
  extractClauseNumbers,
  extractStandardCodes,
  standardCodesMatch,
} from "./standard-identifiers.ts";
import { searchArchiveEvidenceIndex } from "./archive-evidence-index.ts";
import { standardReferenceIdentifiers } from "./reference-identifiers.ts";

type Evidence = {
  id: string;
  text: string;
  score: number;
  standardCodes: string[];
  sourceName: string;
  page: number | null;
  sourceFingerprint: string | null;
};

export type VerifiedStandardClaim = {
  standard: string;
  clause: string;
  text: string;
  evidenceId: string;
  evidenceQuote: string;
};

function parseModelJson(text: string) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function sourceIdentity(metadata: any, text: string) {
  return [
    metadata?.standardCode,
    metadata?.documentGroup,
    metadata?.fileName,
    metadata?.sourcePath,
    text.slice(0, 700),
  ]
    .filter(Boolean)
    .join(" ");
}

function evidenceFromMatch(match: any): Evidence | null {
  const metadata = match?.metadata || {};
  if (metadata?.contentType === "document-map") return null;
  const text = String(metadata?.text || metadata?.content || "").trim();
  if (!text) return null;
  const identity = sourceIdentity(metadata, text);
  const standardCodes = extractStandardCodes(identity);
  if (!standardCodes.length) return null;
  return {
    id: String(match?.id || ""),
    text,
    score: Number(match?.score || 0),
    standardCodes,
    sourceName: [metadata?.fileName, metadata?.sourcePath]
      .filter(Boolean)
      .join(" "),
    page: Number.isFinite(Number(metadata?.page)) ? Number(metadata.page) : null,
    sourceFingerprint:
      typeof metadata?.sourceFingerprint === "string"
        ? metadata.sourceFingerprint
        : null,
  };
}

function evidenceFromArchiveRow(row: any): Evidence | null {
  const text = String(row?.text || "").trim();
  if (!text) return null;
  const sourceName = [row?.file_name, row?.source_path]
    .filter(Boolean)
    .join(" ");
  const labels = String(row?.identifier_labels || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const standardCodes = [
    ...new Set([...labels, ...extractStandardCodes(`${sourceName} ${text}`)]),
  ];
  if (!standardCodes.length) return null;
  return {
    id: String(row?.id || ""),
    text,
    score: 2,
    standardCodes,
    sourceName,
    page: Number.isFinite(Number(row?.page)) ? Number(row.page) : null,
    sourceFingerprint:
      typeof row?.source_fingerprint === "string"
        ? row.source_fingerprint
        : null,
  };
}

async function searchExactArchiveEvidence(
  requested: string[],
  requestedClauses: string[],
  archiveDb?: any,
) {
  if (!archiveDb || !requested.length) return [] as Evidence[];
  try {
    const rows = await searchArchiveEvidenceIndex(
      archiveDb,
      standardReferenceIdentifiers(requested),
      requestedClauses,
      60,
    );
    return rows
      .map(evidenceFromArchiveRow)
      .filter((item: Evidence | null): item is Evidence => Boolean(item));
  } catch (error) {
    console.warn("Cortex exact archive index unavailable", error);
    return [] as Evidence[];
  }
}

function belongsToRequestedStandard(
  evidence: Evidence,
  requested: string[],
) {
  return (
    requested.length === 0 ||
    requested.some((wanted) =>
      evidence.standardCodes.some((found) => standardCodesMatch(wanted, found)),
    )
  );
}

function buildQueries(question: string, route: any) {
  const concepts = [
    ...(Array.isArray(route?.topics) ? route.topics : []),
    ...(Array.isArray(route?.components) ? route.components : []),
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .slice(0, 8);
  const requested = extractStandardCodes(question);
  const clauses = extractClauseNumbers(question);
  const queries = [
    question,
    [question, ...requested, ...clauses, ...concepts].join(" "),
  ];
  return [...new Set(queries.map((item) => item.trim()).filter(Boolean))].slice(
    0,
    3,
  );
}

async function searchEvidence(
  question: string,
  route: any,
  ai: any,
  vectorize: any,
  multilingual?: MultilingualRetrieval,
  archiveDb?: any,
) {
  const requested = extractStandardCodes(question);
  const requestedClauses = extractClauseNumbers(question);
  const exactEvidence = await searchExactArchiveEvidence(
    requested,
    requestedClauses,
    archiveDb,
  );
  const queries = buildQueries(question, route);
  // Exact identifiers plus a clause form a deterministic archive address. The
  // model never needs to know a file/folder address; the index resolves it. If
  // that address produced evidence, avoid a noisy semantic search entirely.
  const backends = exactEvidence.length
    ? []
    : await createQueryBackends(queries, ai, vectorize, multilingual);
  const matches: any[] = [];
  const seen = new Set<string>();

  for (const backend of backends) {
    const resultSets: any[] = [];
    try {
      const filtered = await backend.vectorize.query(backend.vector, {
        topK: 40,
        returnMetadata: "all",
        filter: { contentType: "standard" },
      });
      resultSets.push(filtered);
    } catch (error) {
      console.warn("Cortex standards metadata filter unavailable", error);
    }

    // Classification metadata is an accelerator, never an authority. Older
    // or imperfectly classified archive chunks must remain discoverable; the
    // exact standard identifier and clause checks below are the trust gate.
    try {
      const unfiltered = await backend.vectorize.query(backend.vector, {
        topK: 50,
        returnMetadata: "all",
      });
      resultSets.push(unfiltered);
    } catch (error) {
      console.warn("Cortex standards unfiltered retrieval unavailable", error);
    }

    for (const result of resultSets) {
      for (const match of result?.matches || []) {
        const key = String(match?.id || "");
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        matches.push(match);
      }
    }
  }

  const evidence = [...exactEvidence, ...matches.map(evidenceFromMatch)]
    .filter((item): item is Evidence => Boolean(item))
    .filter((item) => belongsToRequestedStandard(item, requested))
    .sort((a, b) => {
      const aClause = requestedClauses.some((clause) => a.text.includes(clause));
      const bClause = requestedClauses.some((clause) => b.text.includes(clause));
      if (aClause !== bClause) return aClause ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, 18);

  const discovered = [
    ...new Set(evidence.flatMap((item) => item.standardCodes)),
  ];
  return {
    requested,
    requestedClauses,
    checkedStandards: requested.length ? requested : discovered,
    evidence,
  };
}

function numberTokens(value: string) {
  return (value.match(/\d+(?:[.,]\d+)*/g) || []).map((item) =>
    item.replace(",", "."),
  );
}

function verifyClaims(parsed: any, evidence: Evidence[], clauses: string[]) {
  if (!Array.isArray(parsed?.claims)) return [] as VerifiedStandardClaim[];
  const verified: VerifiedStandardClaim[] = [];
  const seen = new Set<string>();
  for (const claim of parsed.claims) {
    const evidenceIndex = Number(claim?.evidenceIndex);
    const selected = evidence[evidenceIndex - 1];
    const standard =
      typeof claim?.standard === "string" ? claim.standard.trim() : "";
    const clause = typeof claim?.clause === "string" ? claim.clause.trim() : "";
    const text = typeof claim?.text === "string" ? claim.text.trim() : "";
    const quote =
      typeof claim?.evidenceQuote === "string"
        ? claim.evidenceQuote.replace(/\s+/g, " ").trim()
        : "";
    if (!selected || !standard || !clause || !text || quote.length < 12)
      continue;
    const source = selected.text.replace(/\s+/g, " ").trim();
    if (!source.includes(quote) || !source.includes(clause)) continue;
    if (
      !selected.standardCodes.some((found) =>
        standardCodesMatch(found, standard),
      )
    )
      continue;
    if (clauses.length && !clauses.includes(clause)) continue;
    if (numberTokens(text).some((token) => !numberTokens(source).includes(token)))
      continue;
    const key = `${standard}:${clause}:${text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push({
      standard,
      clause,
      text,
      evidenceId: selected.id,
      evidenceQuote: quote,
    });
  }
  return verified.slice(0, 8);
}

function formatAnswer(claims: VerifiedStandardClaim[], language?: string | null) {
  const details = claims
    .map((claim) => `• ${claim.standard}, ${claim.clause} — ${claim.text}`)
    .join("\n");
  if (language === "de") return `Kurz gesagt:\n${claims[0].text}\n\nNormnachweis:\n${details}`;
  if (language === "fa") return `خلاصه:\n${claims[0].text}\n\nمدرک استاندارد:\n${details}`;
  if (language === "es") return `En resumen:\n${claims[0].text}\n\nEvidencia normativa:\n${details}`;
  return `In short:\n${claims[0].text}\n\nStandard evidence:\n${details}`;
}

function unverifiedMessage(language?: string | null) {
  if (language === "de")
    return "Für diese Frage konnte ich noch keinen ausreichend sicheren Originalabschnitt verifizieren.";
  if (language === "fa")
    return "برای این سؤال هنوز نتوانستم یک بخش اصلی و به‌اندازهٔ کافی مطمئن را تأیید کنم.";
  if (language === "es")
    return "Todavía no pude verificar un apartado original con suficiente fiabilidad para esta pregunta.";
  return "I could not yet verify a sufficiently reliable original section for this question.";
}

export function isStandardsQuestion(question: string, route?: any) {
  if (route?.intent === "standard" || route?.evidenceNeed === "standard")
    return true;
  return (
    extractStandardCodes(question).length > 0 ||
    /\b(norm|normen|standard|standards|norma|normas)\b/i.test(question) ||
    /(استاندارد|نورم|نُرم)/i.test(question)
  );
}

export async function answerStandardsQuestion(
  question: string,
  route: any,
  apiKey: string,
  ai: any,
  vectorize: any,
  multilingual?: MultilingualRetrieval,
  fetchImpl: FetchLike = fetch,
  _retrievalFetchImpl: FetchLike = fetchImpl,
  archiveDb?: any,
) {
  const retrieval = await searchEvidence(
    question,
    route,
    ai,
    vectorize,
    multilingual,
    archiveDb,
  );
  if (!retrieval.evidence.length) {
    return {
      sufficient: false,
      answer: unverifiedMessage(route?.questionLanguage),
      checkedStandards: retrieval.checkedStandards,
      verifiedClaims: [] as VerifiedStandardClaim[],
    };
  }

  const excerpts = retrieval.evidence
    .map(
      (item, index) =>
        `EVIDENCE ${index + 1}\nSTANDARD IDS: ${item.standardCodes.join(", ")}\nSOURCE: ${item.sourceName || "private source"}\nPAGE: ${item.page ?? "unknown"}\nEXCERPT:\n${item.text}`,
    )
    .join("\n\n");
  const prompt = `You are a source-bound standards evidence compiler.
Use only the supplied raw excerpts. Return no claim that is not directly supported.
Every claim must copy a verbatim supporting quote, name a standard identifier present in that same evidence, and give a clause number present in that same evidence.
Every number and unit in claim.text must be present in the same evidence.
If the user requested a specific clause, use only that clause.
Write claim.text in the user's language (${route?.questionLanguage || "en"}).
Return ONLY JSON: {"claims":[{"standard":"identifier","clause":"exact clause","text":"answer","evidenceIndex":1,"evidenceQuote":"verbatim quote"}]}.
If nothing directly answers the question, return {"claims":[]}.

QUESTION:\n${question}
REQUESTED STANDARDS: ${JSON.stringify(retrieval.requested)}
REQUESTED CLAUSES: ${JSON.stringify(retrieval.requestedClauses)}

${excerpts}`;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 2400,
        },
      }),
    },
  );
  if (!response.ok) {
    return {
      sufficient: false,
      answer: unverifiedMessage(route?.questionLanguage),
      checkedStandards: retrieval.checkedStandards,
      verifiedClaims: [] as VerifiedStandardClaim[],
    };
  }
  const data: any = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text || "")
    .join("")
    .trim();
  const claims = verifyClaims(
    raw ? parseModelJson(raw) : null,
    retrieval.evidence,
    retrieval.requestedClauses,
  );
  return {
    sufficient: claims.length > 0,
    answer: claims.length
      ? formatAnswer(claims, route?.questionLanguage)
      : unverifiedMessage(route?.questionLanguage),
    checkedStandards: retrieval.checkedStandards,
    verifiedClaims: claims,
  };
}
