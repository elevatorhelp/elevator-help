import { RouterResult } from "./router";

export type InternalEvidence = {
  text: string;
  score: number;
  manufacturer: string | null;
  controller: string | null;
  faultCode: string | null;
  faultName: string | null;
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
  // Current Beta corpus is German. Do not force a language filter here: semantic routing may
  // normalize/translate later and older indexed records may use different language metadata.
  const options: any = { topK: 3, returnMetadata: "all" };
  if (Object.keys(filter).length) options.filter = filter;

  const result = await vectorize.query(queryVector, options);
  const matches = Array.isArray(result?.matches) ? result.matches : [];

  return matches
    .map((match: any) => {
      const metadata = match?.metadata || {};
      return {
        text: typeof metadata.text === "string" ? metadata.text.trim() : "",
        score: Number(match?.score || 0),
        manufacturer: typeof metadata.manufacturer === "string" ? metadata.manufacturer : null,
        controller: typeof metadata.controller === "string" ? metadata.controller : null,
        faultCode: metadata.faultCode != null ? String(metadata.faultCode) : null,
        faultName: typeof metadata.faultName === "string" ? metadata.faultName : null,
      } as InternalEvidence;
    })
    // A retrieval hit is usable only when it contains actual evidence text. Internal IDs,
    // filenames, document names and storage metadata are deliberately never returned.
    .filter((item: InternalEvidence) => item.text.length > 0 && item.score >= 0.55);
}
