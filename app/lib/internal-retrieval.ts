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
    route.controller ||
    route.faultCode ||
    route.faultFamily ||
    route.intent === "documentation" ||
    route.intent === "troubleshooting"
  );
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
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

  const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", { text: [query] });
  const queryVector = (embeddingResult as any)?.data?.[0];
  if (!queryVector) return [];

  const filter = buildFilter(route);
  // Retrieve a wider candidate set, then cheaply rerank locally. This follows the useful
  // retrieve-wide/rerank-narrow pattern without adding another paid LLM call.
  const options: any = { topK: 12, returnMetadata: "all" };
  if (Object.keys(filter).length) options.filter = filter;

  const result = await vectorize.query(queryVector, options);
  const matches = Array.isArray(result?.matches) ? result.matches : [];

  const ranked = matches
    .map((match: any) => {
      const metadata = match?.metadata || {};
      return {
        text: typeof metadata.text === "string" ? metadata.text.trim() : "",
        score: Number(match?.score || 0),
        manufacturer: typeof metadata.manufacturer === "string" ? metadata.manufacturer : null,
        controller: typeof metadata.controller === "string" ? metadata.controller : null,
        faultCode: metadata.faultCode != null ? String(metadata.faultCode) : null,
        faultName: typeof metadata.faultName === "string" ? metadata.faultName : null,
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : null,
      } as InternalEvidence;
    })
    // Document-map vectors are navigation metadata, not source evidence. Their text can contain
    // internal filenames and generated summaries, so they must never enter answer synthesis.
    .filter((item: InternalEvidence) => normalized(item.contentType) !== "document-map")
    // Keep a modest semantic floor for candidates. Exact routed metadata can then promote the
    // best evidence, while weak unrelated matches still cannot reach the synthesis context.
    .filter((item: InternalEvidence) => item.text.length > 0 && item.score >= 0.45)
    .map((item: InternalEvidence) => ({ ...item, score: item.score + routeBoost(item, route) }))
    .sort((a: InternalEvidence, b: InternalEvidence) => b.score - a.score)
    .filter((item: InternalEvidence) => item.score >= 0.55);

  // Ingestion overlap and repeated manual sections can yield duplicate evidence. Remove exact
  // normalized duplicates before context assembly so they do not waste Gemini context tokens or
  // crowd out distinct supporting chunks. This is deterministic and does not alter source text.
  return dedupeEvidence(ranked).slice(0, 4);
}
