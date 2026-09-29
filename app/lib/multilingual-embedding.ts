export const MULTILINGUAL_EMBEDDING_MODEL = "gemini-embedding-001";
export const MULTILINGUAL_EMBEDDING_DIMENSIONS = 768;
export const MULTILINGUAL_EMBEDDING_VERSION = 3;

type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
type FetchLike = typeof fetch;

function normalizeVector(values: unknown): number[] {
  if (
    !Array.isArray(values) ||
    values.length !== MULTILINGUAL_EMBEDDING_DIMENSIONS
  ) {
    throw new Error("Gemini embedding returned an unexpected vector size");
  }

  const vector = values.map((value) => Number(value));
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Gemini embedding returned a non-numeric vector");
  }

  // Gemini embedding-001 must be normalized manually when a Matryoshka
  // dimension smaller than the native 3072 dimensions is requested.
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Gemini embedding returned a zero-length vector");
  }
  return vector.map((value) => value / magnitude);
}

async function embeddingRequest(
  texts: string[],
  taskType: EmbeddingTask,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<number[][]> {
  if (!apiKey)
    throw new Error("GEMINI_API_KEY is missing for multilingual embeddings");
  if (!texts.length) return [];
  if (texts.some((text) => typeof text !== "string" || !text.trim())) {
    throw new Error("Embedding input must contain non-empty text");
  }

  const model = `models/${MULTILINGUAL_EMBEDDING_MODEL}`;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model,
          taskType,
          outputDimensionality: MULTILINGUAL_EMBEDDING_DIMENSIONS,
          content: { parts: [{ text }] },
        })),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Gemini embedding error ${response.status}: ${await response.text()}`,
    );
  }

  const payload: any = await response.json();
  const embeddings = Array.isArray(payload?.embeddings)
    ? payload.embeddings
    : [];
  if (embeddings.length !== texts.length) {
    throw new Error("Gemini embedding count does not match input count");
  }
  return embeddings.map((embedding: any) => normalizeVector(embedding?.values));
}

export function embedRetrievalDocuments(
  texts: string[],
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<number[][]> {
  return embeddingRequest(texts, "RETRIEVAL_DOCUMENT", apiKey, fetchImpl);
}

export async function embedRetrievalQuery(
  text: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<number[]> {
  const [vector] = await embeddingRequest(
    [text],
    "RETRIEVAL_QUERY",
    apiKey,
    fetchImpl,
  );
  return vector;
}
