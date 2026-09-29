import type { RouterResult } from "./router";
import {
  createQueryBackend,
  type MultilingualRetrieval,
} from "./retrieval-backend.ts";

export type InternalEvidence = {
  id: string;
  text: string;
  score: number;
  manufacturer: string | null;
  controller: string | null;
  faultCode: string | null;
  faultName: string | null;
  contentType: string | null;
  sourceName: string | null;
};

function buildFilter(route: RouterResult) {
  const filter: Record<string, string> = {};
  if (route.manufacturer) filter.manufacturer = route.manufacturer;
  if (route.controller) filter.controller = route.controller;
  if (route.faultFamily) filter.faultFamily = route.faultFamily;
  if (route.faultCode) filter.faultCode = String(route.faultCode);
  if (route.faultFamily || route.faultCode || route.faultName)
    filter.contentType = "fault";
  return filter;
}

function buildFilterAttempts(route: RouterResult) {
  const full = buildFilter(route);
  const attempts: Record<string, string>[] = [];
  if (Object.keys(full).length) attempts.push(full);
  // A manufacturer-qualified fault lookup must never broaden to another
  // manufacturer's same-numbered fault. That would turn a missing match into
  // a confident answer grounded in the wrong product family.
  if (route.manufacturer) {
    // Manufacturer/controller metadata in legacy vectors is not normalized.
    // Retrieve a broad candidate pool and enforce the source identity
    // deterministically after the query.
    return [];
  }
  if (route.faultCode) attempts.push({ faultCode: String(route.faultCode) });
  if (route.manufacturer) attempts.push({ manufacturer: route.manufacturer });
  return attempts.filter(
    (filter, index, all) =>
      all.findIndex(
        (candidate) => JSON.stringify(candidate) === JSON.stringify(filter),
      ) === index,
  );
}

export function shouldTryInternalRetrieval(route: RouterResult) {
  if (route.needsClarification || route.searchStrategy === "clarify_first")
    return false;
  if (route.intent === "standard") return false;
  if (route.evidenceNeed === "internal") return true;
  const hasSourceSpecificEntity = Boolean(
    route.manufacturer ||
    route.productFamily ||
    route.controller ||
    route.faultCode ||
    route.faultFamily ||
    route.faultName,
  );
  if (route.intent === "unknown" && !hasSourceSpecificEntity) return false;
  return Boolean(
    hasSourceSpecificEntity ||
    route.intent === "documentation" ||
    route.intent === "troubleshooting" ||
    route.intent === "general_technical" ||
    route.intent === "planning",
  );
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function compactIdentifier(value: unknown) {
  return normalized(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function exactSourceCandidate(item: InternalEvidence, route: RouterResult) {
  const sourceHaystack = compactIdentifier(
    [item.manufacturer, item.controller, item.sourceName, item.text]
      .filter(Boolean)
      .join(" "),
  );
  if (route.manufacturer) {
    const manufacturer = compactIdentifier(route.manufacturer);
    if (!manufacturer || !sourceHaystack.includes(manufacturer)) return false;
  }
  if (route.controller) {
    const controller = compactIdentifier(route.controller);
    if (!controller || !sourceHaystack.includes(controller)) return false;
  }
  if (route.faultCode) {
    const code = normalized(String(route.faultCode));
    const hasCode =
      normalized(item.faultCode) === code ||
      normalized(item.text).includes(code);
    if (!hasCode) return false;
  }
  return true;
}

export function buildRetrievalQuery(query: string, route: RouterResult) {
  const entities = [
    route.manufacturer,
    route.productFamily,
    route.controller,
    route.faultCode ? `fault ${route.faultCode}` : null,
    route.faultFamily,
    route.faultName,
    ...(route.components || []),
    ...(route.topics || []),
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .map((value) => value.trim());

  const uniqueEntities = [
    ...new Set(entities.map((value) => value.toLowerCase())),
  ];
  const entityText = uniqueEntities.join(" ");
  return entityText ? `${query}\nTechnical entities: ${entityText}` : query;
}

function routeBoost(item: InternalEvidence, route: RouterResult) {
  let boost = 0;
  if (
    route.manufacturer &&
    normalized(item.manufacturer) === normalized(route.manufacturer)
  )
    boost += 0.08;
  if (
    route.controller &&
    normalized(item.controller) === normalized(route.controller)
  )
    boost += 0.08;
  if (
    route.faultCode &&
    normalized(item.faultCode) === normalized(String(route.faultCode))
  )
    boost += 0.12;
  if (
    route.faultCode &&
    normalized(item.text).includes(normalized(String(route.faultCode)))
  )
    boost += 0.5;
  if (
    route.faultName &&
    normalized(item.faultName).includes(normalized(route.faultName))
  )
    boost += 0.05;
  return boost;
}

function retrievalFingerprint(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 700);
}

function dedupeEvidence(items: InternalEvidence[]) {
  const seen = new Set<string>();
  const out: InternalEvidence[] = [];
  for (const item of items) {
    const key = retrievalFingerprint(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function authoritativeCandidate(item: any) {
  const kind = normalized(
    item?.metadata?.contentType || item?.metadata?.kind || item?.metadata?.type,
  );
  const source = normalized(
    item?.metadata?.source ||
      item?.metadata?.sourceType ||
      item?.metadata?.documentType,
  );
  const generated =
    item?.metadata?.generated === true ||
    normalized(item?.metadata?.generated) === "true";
  if (generated) return false;
  if (/document[-_ ]?map|summary|metadata|index/.test(kind)) return false;
  if (/document[-_ ]?map|summary|metadata|index/.test(source)) return false;
  return true;
}

export async function retrieveInternalEvidence(
  query: string,
  route: RouterResult,
  ai: any,
  vectorize: any,
  multilingual?: MultilingualRetrieval,
): Promise<InternalEvidence[]> {
  if (!shouldTryInternalRetrieval(route)) return [];
  const retrievalQuery =
    route.manufacturer && route.faultCode
      ? `${String(route.faultCode)} ${route.manufacturer}`
      : buildRetrievalQuery(query, route);
  const backend = await createQueryBackend(
    retrievalQuery,
    ai,
    vectorize,
    multilingual,
  );
  const vector = backend.vector;
  vectorize = backend.vectorize;
  const options = {
    topK: route.manufacturer ? 50 : 12,
    returnMetadata: "all",
  };
  let result: any;
  for (const filter of buildFilterAttempts(route)) {
    try {
      result = await vectorize.query(vector, { ...options, filter });
      if (result?.matches?.length) break;
    } catch (error) {
      console.warn("Filtered internal retrieval attempt unavailable", {
        filter,
        error,
      });
    }
  }
  if (!result?.matches?.length) {
    // Older/raw Drive vectors may not yet carry structured fault metadata.
    // A semantic fallback is allowed only with deterministic post-filtering
    // for both the exact code and manufacturer identity.
    result = await vectorize.query(vector, options);
  }
  const candidates = (result.matches || [])
    .filter(authoritativeCandidate)
    .map((match: any) => ({
      id: String(match?.id || ""),
      text: String(
        match?.metadata?.text || match?.metadata?.content || "",
      ).trim(),
      score: Number(match?.score || 0),
      manufacturer: match?.metadata?.manufacturer ?? null,
      controller: match?.metadata?.controller ?? null,
      faultCode: match?.metadata?.faultCode ?? null,
      faultName: match?.metadata?.faultName ?? null,
      contentType: match?.metadata?.contentType ?? null,
      sourceName:
        [match?.metadata?.fileName, match?.metadata?.sourcePath]
          .filter(Boolean)
          .join(" ") || null,
    }))
    .filter((item: InternalEvidence) => exactSourceCandidate(item, route))
    .filter((item: InternalEvidence) => item.text.length > 0)
    .map((item: InternalEvidence) => ({
      ...item,
      score: item.score + routeBoost(item, route),
    }))
    .sort((a: InternalEvidence, b: InternalEvidence) => b.score - a.score);
  return dedupeEvidence(candidates).slice(0, 5);
}
