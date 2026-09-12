export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    const body: any = await request.json();
    const question = body?.question;

    if (!question || typeof question !== "string") {
      return Response.json(
        { ok: false, error: "question is required" },
        { status: 400 }
      );
    }

    const prompt = `
You are the routing layer of an elevator technical knowledge base.

Your task is NOT to answer the user's technical question.
Your task is to determine where the system should search.

Important rules:

1. Never invent a manufacturer, controller or component.
2. A fault number alone is NOT enough to identify a controller.
3. A technical term may suggest a manufacturer/controller only if there is strong evidence.
4. If identification is uncertain, mark it as uncertain.
5. Distinguish troubleshooting questions from documentation, standards, planning and general technical questions.
6. Return ONLY valid JSON.
7. Detect the language of the user's question.
8. Prefer technical documentation in the same language as the user's question when available.
9. If matching documentation is unavailable in that language, the retrieval query may later be translated into the available source language.
10. The final answer must be generated in the user's original question language.

Known knowledge-base example:

Manufacturer: NEW LIFT
Product family: FST
Controller: FST-3

Known FST-3 fault family:
LSU

Examples include:
LSU-ANFAHRPROBLEM
LSU-LAUFZEITUEBERWCH
LSU-GEBERFEHLER
LSU-KABIN. KOMMUNIKTN
LSU-ZONE FEHLT
LSU-BREMSE FEHLER
LSU-MOTOR FEHLER
LSU-ZWANGSHALT
LSU-NOTENDSCHALTER

Required JSON:

{
  "intent": "troubleshooting" | "documentation" | "standard" | "planning" | "general_technical" | "unknown", 
  "questionLanguage": string,
  "preferredSourceLanguage": string,
  "manufacturer": string | null,
  "productFamily": string | null,
  "controller": string | null,
  "faultCode": string | null,
  "faultFamily": string | null,
  "topics": string[],
  "components": string[],
  "confidence": "high" | "medium" | "low",
  "needsClarification": boolean,
  "clarificationQuestion": string | null,
  "searchStrategy": "filtered" | "semantic_broad" | "clarify_first"
}

User question:
${question}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gemini error: ${await response.text()}`
      );
    }

    const data: any = await response.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no content");
    }

    return Response.json({
      ok: true,
      question,
      route: JSON.parse(text),
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