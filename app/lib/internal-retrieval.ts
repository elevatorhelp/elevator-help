import { RouterResult } from "./router";

export type InternalEvidence = {
  text: string;
  score: number;
  manufacturer: string | null;
  controller: string | null;
  faultCode: string | null;
  faultName: string | null;
  contentType: string | null;
};

function buildFilter(route: RouterResult) {
  const filter: Record<string, string> = {};
  if (route.manufacturer) filter.manufacturer = route.manufacturer;
  if (route.controller) filter.controller = route.controller;
  if (route.faultFamily) filter.faultFamily = route.faultFamily;
  if (route.faultCode) filter.faultCode = String(route.faultCode);
  if (route.faultFamily || route.faultCode || route.faultName) filter.contentType = "fault";
  return filter;
}

export function shouldTryInternalRetrieval(route: RouterResult) {
  if (route.needsClarification || route.searchStrategy === "clarify_first") return false;
  if (route.intent === "standard" || route.intent === "unknown") return false;
  return Boolean(
    route.manufacturer ||
    route.productFamily ||
    route.controller ||
    route.faultCode ||
    route.faultFamily ||
    route.faultName ||
    route.intent === "documentation" ||
    route.intent === "troubleshooting"
  );
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildRetrievalQuery(query: string, route: RouterResult) {
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
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  const uniqueEntities = [...new Set(entities.map((value) => value.toLowerCase()))];
  const entityText = uniqueEntities.join(" ");
  return entityText ? `${query}\nTechnical entities: ${entityText}` : query;
}

function routeBoost(item: InternalEvidence, route: RouterResult) {
  let boost = 0;
  if (route.manufacturer && normalized(item.manufacturer) === normalized(route.manufacturer)) boost += 0.08;
  if (route.controller && normalized(item.controller) === normalized(route.controller)) boost += 0.08;
  if (route.faultCode && normalized(item.faultCode) === normalized(String(route.faultCode))) boost += 0.12;
  if (route.faultName && normalized(item.faultName).includes(normalized(route.faultName))) boost += 0.05;
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
  const unique: InternalEvidence[] = [];

  for (const item of items) {
    const fingerprint = retrievalFingerprint(item.text);
    if (!fingerprint || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    unique.push(item);
  }

  return unique;
}

export async function retrieveInternalEvidence(
  query: string,
  route: RouterResult,
  ai: any,
  vectorize: any
): Promise<InternalEvidence[]> {
  if (!ai || !vectorize) return [];

  // Keep the router's self-contained normalized question as the semantic anchor, but append
  // resolved entities so retrieval can exploit context without replacing semantic meaning.
  const retrievalQuery = buildRetrievalQuery(query, route);
  const embedded = await ai.run("@cf/baai/bge-m3", { text: [retrievalQuery] });
  const vector = embedded?.data?.[0];
  if (!Array.isArray(vector)) return [];

  const filter = buildFilter(route);
  const result = await vectorize.query(vector, {
    topK: 20,
    returnMetadata: "all",
    ...(Object.keys(filter).length ? { filter } : {}),
  });

  const matches = Array.isArray(result?.matches) ? result.matches : [];
  const candidates: InternalEvidence[] = matches
    .map((match: any) => ({
      text: typeof match?.metadata?.text === "string" ? match.metadata.text.trim() : "",
      score: Number(match?.score || 0),
      manufacturer: match?.metadata?.manufacturer ?? null,
      controller: match?.metadata?.controller ?? null,
      faultCode: match?.metadata?.faultCode ?? null,
      faultName: match?.metadata?.faultName ?? null,
      contentType: match?.metadata?.contentType ?? null,
    }))
    .filter((item: InternalEvidence) => item.text.length > 0)
    .map((item: InternalEvidence) => ({ ...item, score: item.score + routeBoost(item, route) }))
    .sort((a: InternalEvidence, b: InternalEvidence) => b.score - a.score);

  return dedupeEvidence(candidates).slice(0, 6);
}
