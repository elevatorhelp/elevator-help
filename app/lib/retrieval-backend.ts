import { embedRetrievalQuery } from "./multilingual-embedding.ts";
import type { FetchLike } from "./gemini-cost-control.ts";

export type MultilingualRetrieval = {
  apiKey: string;
  vectorize: any;
  enabled: boolean;
  fetchImpl?: FetchLike;
};

export type QueryBackend = {
  vector: number[];
  vectorize: any;
  embeddingVersion: 2 | 3;
};

export async function createQueryBackend(
  query: string,
  ai: any,
  legacyVectorize: any,
  multilingual?: MultilingualRetrieval,
): Promise<QueryBackend> {
  if (multilingual?.enabled && multilingual.apiKey && multilingual.vectorize) {
    try {
      return {
        vector: await embedRetrievalQuery(
          query,
          multilingual.apiKey,
          multilingual.fetchImpl,
        ),
        vectorize: multilingual.vectorize,
        embeddingVersion: 3,
      };
    } catch (error) {
      console.error(
        "Multilingual query embedding unavailable; using legacy retrieval",
        error,
      );
    }
  }

  const embedding = await ai.run("@cf/baai/bge-base-en-v1.5", {
    text: [query],
  });
  const vector = (embedding as any)?.data?.[0];
  if (!Array.isArray(vector))
    throw new Error("Legacy retrieval embedding failed");
  return { vector, vectorize: legacyVectorize, embeddingVersion: 2 };
}

export function multilingualRetrievalFromEnv(
  env: any,
  apiKey: string,
  fetchImpl?: FetchLike,
) {
  const configuredFlag =
    env?.MULTILINGUAL_RETRIEVAL_ENABLED ??
    process.env.MULTILINGUAL_RETRIEVAL_ENABLED;
  return {
    apiKey,
    vectorize: env?.VECTORIZE_V2,
    enabled: String(configuredFlag).toLowerCase() === "true",
    fetchImpl,
  } satisfies MultilingualRetrieval;
}
