export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    const technicalText = `
Manufacturer: NEW LIFT
Controller: FST-3
Page: 184
Code: 14
Fault: LSU-ANFAHRPROBLEM

Der Fahrkorb fährt trotz aktiver Vorsteuerung nicht an.

Vorsteuerrelais auf FST prüfen.
Haupt-, Brems- und Ventil-Ansteuerungsschütze prüfen.
Motor, Bremse und Ventile prüfen.
Geschwindigkeit des Fahrkorbes beim Start viel zu gering.
`;

    const prompt = `
You are classifying technical elevator documentation for a troubleshooting knowledge base.

Return ONLY valid JSON.

Do not invent information not supported by the supplied text.

Create routing metadata for this technical chunk.

Required JSON structure:

{
  "manufacturer": string,
  "productFamily": string | null,
  "controller": string,
  "contentType": "fault",
  "faultCode": string,
  "faultName": string,
  "aliases": string[],
  "topics": string[],
  "components": string[],
  "intentHints": string[],
  "troubleshootingRelevant": boolean
}

Technical source:

${technicalText}
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
      enrichment: JSON.parse(text),
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