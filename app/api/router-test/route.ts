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

1. Never invent a manufacturer, controller, component, fault code or fault name.
2. A fault number alone is NOT enough to identify a manufacturer or controller.
3. A technical term may suggest a manufacturer/controller only if there is strong evidence.
4. If identification is uncertain, mark it as uncertain.
5. Distinguish troubleshooting questions from documentation, standards, planning and general technical questions.
6. Return ONLY valid JSON.
7. Detect the language of the user's question.
8. Prefer technical documentation in the same language as the user's question when available.
9. If matching documentation is unavailable in that language, the retrieval query may later be translated into the available source language.
10. The final answer must be generated in the user's original question language.
11. faultFamily is the fault family or prefix, such as "LSU".
12. faultCode must contain ONLY a numeric fault code explicitly stated by the user, such as "14", "15" or "20".
13. Never put a fault family such as "LSU" into faultCode.
14. If the user does not explicitly state a numeric fault code, faultCode MUST be null.
15. faultName is the specific named fault, such as "LSU-ANFAHRPROBLEM".
16. faultName may be inferred from symptoms only when there is strong evidence.
17. Do not infer a numeric faultCode from symptoms. Even if the symptoms strongly match a known fault, keep faultCode null unless the user explicitly provided the number.
18. If the user only mentions "LSU", set faultFamily to "LSU" and faultCode to null.
19. If the user provides a number such as "14" without enough manufacturer/controller context, preserve faultCode as "14" but ask for clarification instead of assuming the controller.
20. topics and components should describe useful retrieval concepts from the user's question. Do not invent unrelated components.

Known knowledge-base example:

Manufacturer: NEW LIFT
Product family: FST
Controller: FST-3

Known FST-3 fault family:
LSU

Important mapping:

"LSU" is a faultFamily, NOT a faultCode.

Examples:

faultFamily = "LSU"
faultCode = "14"
faultName = "LSU-ANFAHRPROBLEM"

faultFamily = "LSU"
faultCode = "15"
faultName = "LSU-LAUFZEITUEBERWCH"

faultFamily = "LSU"
faultCode = "16"
faultName = "LSU-GEBERFEHLER"

faultFamily = "LSU"
faultCode = "17"
faultName = "LSU-KABIN. KOMMUNIKTN"

faultFamily = "LSU"
faultCode = "18"
faultName = "LSU-GESCHW. ENDSCHLTR"

faultFamily = "LSU"
faultCode = "19"
faultName = "LSU-ZONE FEHLT"

faultFamily = "LSU"
faultCode = "20"
faultName = "LSU-BREMSE FEHLER"

faultFamily = "LSU"
faultCode = "21"
faultName = "LSU-MOTOR FEHLER"

faultFamily = "LSU"
faultCode = "22"
faultName = "LSU-ZWANGSHALT"

faultFamily = "LSU"
faultCode = "23"
faultName = "LSU-NOTENDSCHALTER"

Example interpretation:

User:
"LSU fault. The elevator does not start moving even though pre-control is active."

Possible routing:
manufacturer = "NEW LIFT"
productFamily = "FST"
controller = "FST-3"
faultFamily = "LSU"
faultCode = null
faultName = "LSU-ANFAHRPROBLEM"

The faultCode remains null because the user did NOT explicitly provide "14".

Another example:

User:
"Fehler 14"

Routing:
faultCode = "14"
manufacturer = null
productFamily = null
controller = null
faultFamily = null
faultName = null
needsClarification = true
searchStrategy = "clarify_first"

Do NOT assume NEW LIFT or FST-3 from the number 14 alone.

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
  "faultName": string | null,
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
      throw new Error(`Gemini error: ${await response.text()}`);
    }

    const data: any = await response.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini returned no content");
    }

    const route = JSON.parse(text);

    const questionLanguage =
      route.questionLanguage ??
      (/^[\x00-\x7F]*$/.test(question) ? "en" : null);

    const preferredSourceLanguage =
      route.preferredSourceLanguage ??
      questionLanguage;

    return Response.json({
      ok: true,
      question,
      route: {
        ...route,
        questionLanguage,
        preferredSourceLanguage,
      },
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