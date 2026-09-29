import { embedRetrievalQuery } from "./multilingual-embedding.ts";

export type MultilingualRetrieval = {
  apiKey: string;
  vectorize: any;
  enabled: boolean;
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
        vector: await embedRetrievalQuery(query, multilingual.apiKey),
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

export function multilingualRetrievalFromEnv(env: any, apiKey: string) {
  return {
    apiKey,
    vectorize: env?.VECTORIZE_V2,
    enabled: process.env.MULTILINGUAL_RETRIEVAL_ENABLED === "true",
  } satisfies MultilingualRetrieval;
}
