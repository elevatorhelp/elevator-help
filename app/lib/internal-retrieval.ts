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
  if (route.intent === "standard") return false;
  const hasSourceSpecificEntity = Boolean(
    route.manufacturer ||
    route.productFamily ||
    route.controller ||
    route.faultCode ||
    route.faultFamily ||
    route.faultName
  );
  if (route.intent === "unknown" && !hasSourceSpecificEntity) return false;
  return Boolean(
    hasSourceSpecificEntity ||
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
  const kind = normalized(item?.metadata?.contentType || item?.metadata?.kind || item?.metadata?.type);
  const source = normalized(item?.metadata?.source || item?.metadata?.sourceType || item?.metadata?.documentType);
  const generated = item?.metadata?.generated === true || normalized(item?.metadata?.generated) === "true";
  if (generated) return false;
  if (/document[-_ ]?map|summary|metadata|index/.test(kind)) return false;
  if (/document[-_ ]?map|summary|metadata|index/.test(source)) return false;
  return true;
}

export async function retrieveInternalEvidence(
  query: string,
  route: RouterResult,
  ai: Ai,
  vectorize: VectorizeIndex
): Promise<InternalEvidence[]> {
  if (!shouldTryInternalRetrieval(route)) return [];
  const retrievalQuery = buildRetrievalQuery(query, route);
  const embedding = await ai.run("@cf/baai/bge-base-en-v1.5", { text: [retrievalQuery] });
  const vector = (embedding as any)?.data?.[0];
  if (!Array.isArray(vector)) throw new Error("Internal retrieval embedding failed");
  const filter = buildFilter(route);
  const result = await vectorize.query(vector, {
    topK: 12,
    returnMetadata: "all",
    ...(Object.keys(filter).length ? { filter } : {}),
  });
  const candidates = (result.matches || [])
    .filter(authoritativeCandidate)
    .map((match: any) => ({
      text: String(match?.metadata?.text || match?.metadata?.content || "").trim(),
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
  return dedupeEvidence(candidates).slice(0, 5);
}
