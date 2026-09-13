import { getCloudflareContext } from "@opennextjs/cloudflare";
import { routeQuestion } from "../../lib/router";

export async function POST(request: Request) {
  try {
    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 }
      );
    }

    const { env } = getCloudflareContext();

    const ai = (env as any).AI;
    const vectorize = (env as any).VECTORIZE;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    // Route the question directly through shared server logic.
    // No internal HTTP self-call.
    const route = await routeQuestion(question);

    if (
      route.needsClarification === true ||
      route.searchStrategy === "clarify_first"
    ) {
      return Response.json({
        ok: true,
        mode: "clarification",
        question,
        route,
        clarificationQuestion:
          route.clarificationQuestion ||
          "I need one more detail before I can search reliably.",
        matches: [],
      });
    }

    let retrievalQuery = question;
    let retrievalLanguage = route.questionLanguage || "unknown";

    // Temporary source-language behavior for the current FST-3 test corpus.
    // Later this will be selected from available document languages.
    if (route.questionLanguage !== "de") {
      const translationPrompt = `
Translate the following elevator technical question into concise technical German for semantic search in elevator manuals.

Rules:
- Preserve the exact technical meaning.
- Preserve manufacturer names exactly.
- Preserve controller names exactly.
- Preserve fault families exactly.
- Preserve fault codes exactly.
- Preserve component names when appropriate.
- Do not answer the question.
- Do not explain anything.
- Return only the German technical search query.

Question:
${question}
`;

      const translationResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: translationPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0,
            },
          }),
        }
      );

      if (!translationResponse.ok) {
        throw new Error(
          `Gemini translation error: ${await translationResponse.text()}`
        );
      }

      const translationData: any = await translationResponse.json();
      const translatedText =
        translationData?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!translatedText) {
        throw new Error(
          "Gemini returned no translated retrieval query"
        );
      }

      retrievalQuery = translatedText.trim();
      retrievalLanguage = "de";
    }

    const embeddingResult = await ai.run(
      "@cf/baai/bge-base-en-v1.5",
      {
        text: [retrievalQuery],
      }
    );

    const queryVector = (embeddingResult as any).data?.[0];

    if (!queryVector) {
      throw new Error("No query embedding returned");
    }

    const filter: Record<string, string> = {};

    if (route.manufacturer) {
      filter.manufacturer = route.manufacturer;
    }

    if (route.controller) {
      filter.controller = route.controller;
    }

    if (route.faultFamily) {
      filter.faultFamily = route.faultFamily;
    }

    if (route.faultCode) {
      filter.faultCode = String(route.faultCode);
    }

    if (
      route.faultFamily ||
      route.faultCode ||
      route.faultName
    ) {
      filter.contentType = "fault";
    }

    // Current indexed test material is German.
    filter.language = "de";

    const queryOptions: any = {
      topK: 5,
      returnMetadata: "all",
    };

    if (Object.keys(filter).length > 0) {
      queryOptions.filter = filter;
    }

    const result = await vectorize.query(
      queryVector,
      queryOptions
    );

    return Response.json({
      ok: true,
      mode: "retrieval",
      question,
      route,
      questionLanguage: route.questionLanguage || null,
      retrievalLanguage,
      retrievalQuery,
      appliedFilter: filter,
      matches: result.matches.map((match: any) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata,
      })),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
