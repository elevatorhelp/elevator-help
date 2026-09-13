import { getCloudflareContext } from "@opennextjs/cloudflare";

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

    /*
     * STEP 1
     * Let our existing Router understand the question first.
     */
    const routerUrl = new URL("/api/router-test", request.url);

    const routerResponse = await fetch(routerUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
      }),
    });

    const routerData: any = await routerResponse.json();

    if (!routerResponse.ok || !routerData?.ok) {
      throw new Error(
        routerData?.error || "Router request failed"
      );
    }

    const route = routerData.route;

    if (!route) {
      throw new Error("Router returned no route");
    }

    /*
     * STEP 2
     * If the router says the question is ambiguous,
     * do NOT guess and do NOT search blindly.
     */
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

    /*
     * STEP 3
     * For the CURRENT knowledge base test our indexed FST-3
     * source material is German.
     *
     * Therefore:
     * user language != German
     * → translate only the retrieval query into technical German.
     *
     * The final production system will choose the source language
     * from available document languages automatically.
     */
    let retrievalQuery = question;
    let retrievalLanguage = route.questionLanguage || "unknown";

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

      const translationData: any =
        await translationResponse.json();

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

    /*
     * STEP 4
     * Generate embedding from the language-normalized query.
     */
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

    /*
     * STEP 5
     * Build Vectorize filters dynamically from Router output.
     *
     * No hardcoded NEW LIFT.
     * No hardcoded FST-3.
     * No hardcoded LSU.
     * No hardcoded fault code.
     */
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

    /*
     * If Router clearly identified a fault,
     * narrow the search to fault content.
     */
    if (
      route.faultFamily ||
      route.faultCode ||
      route.faultName
    ) {
      filter.contentType = "fault";
    }

    /*
     * Current indexed test material is German.
     * This is the ONLY remaining temporary language restriction.
     * We remove this when the document-language registry is connected.
     */
    filter.language = "de";

    const queryOptions: any = {
      topK: 5,
      returnMetadata: "all",
    };

    if (Object.keys(filter).length > 0) {
      queryOptions.filter = filter;
    }

    /*
     * STEP 6
     * Semantic search inside the Router-selected knowledge area.
     */
    const result = await vectorize.query(
      queryVector,
      queryOptions
    );

    return Response.json({
      ok: true,
      mode: "retrieval",
      question,

      route,

      questionLanguage:
        route.questionLanguage || null,

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