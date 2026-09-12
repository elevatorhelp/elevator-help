import { getCloudflareContext } from "@opennextjs/cloudflare";

function detectQuestionLanguage(question: string): "de" | "en" {
  const q = question.toLowerCase();

  const germanMarkers = [
    "fehler",
    "aufzug",
    "fahrkorb",
    "steuerung",
    "bremse",
    "motor",
    "tür",
    "schließt",
    "öffnet",
    "fährt",
    "prüfen",
    "störung",
    "vorsteuerung",
  ];

  if (germanMarkers.some((word) => q.includes(word))) {
    return "de";
  }

  return "en";
}

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

    const questionLanguage = detectQuestionLanguage(question);

    let retrievalQuery = question;

    // If the user's question is not German, translate it into technical German
    // because our current indexed source chunks are German.
    if (questionLanguage !== "de") {
      const translationPrompt = `
Translate the following elevator technician question into concise technical German.

Important rules:
- Preserve the technical meaning exactly.
- Preserve manufacturer names, controller names, fault families and fault codes exactly.
- Do not answer the question.
- Do not explain anything.
- Return only the translated German search query.
- Use terminology that would likely appear in an elevator technical manual.

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
        throw new Error("Gemini returned no translated retrieval query");
      }

      retrievalQuery = translatedText.trim();
    }

    // Create embedding from the language-normalized retrieval query
    const embeddingResult = await ai.run(
      "@cf/baai/bge-base-en-v1.5",
      {
        text: [retrievalQuery],
      }
    );

    const queryVector =
      (embeddingResult as any).data?.[0];

    if (!queryVector) {
      throw new Error("No query embedding returned");
    }

    // Search only inside German NEW LIFT / FST-3 / LSU knowledge
    const result = await vectorize.query(
      queryVector,
      {
        topK: 5,
        returnMetadata: "all",
        filter: {
          manufacturer: "NEW LIFT",
          controller: "FST-3",
          contentType: "fault",
          faultFamily: "LSU",
          language: "de",
          documentGroup: "NEWLIFT-FST3",
        },
      }
    );

    return Response.json({
      ok: true,
      question,
      questionLanguage,
      retrievalLanguage: "de",
      retrievalQuery,
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