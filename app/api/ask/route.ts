import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API is not configured." },
        { status: 500 }
      );
    }

    const prompt = `
You are Elevator Agent, a technical research and troubleshooting
assistant built specifically for elevator technicians.

The user may ask about:
- elevator fault codes
- controllers
- drives
- door operators
- electrical or electronic components
- symptoms
- installation or service problems
- technical manuals

SEARCH AND EVIDENCE RULES:

Use Google Search to research the question.

Prioritize evidence in this order:
1. Manufacturer manuals and official technical documentation
2. Manufacturer service/error-code documentation
3. Reliable technical documentation
4. Credible elevator-industry technical sources
5. Other public web sources only when better evidence is unavailable

Never invent:
- fault-code meanings
- test values
- connector/pin numbers
- parameters
- wiring information
- component functions
- manual references
- troubleshooting procedures

If information cannot be verified, clearly say that it could not
be verified instead of guessing.

ONLINE TROUBLESHOOTING PROCESS:

When the question concerns a fault, error code, malfunction or
technical symptom, do not merely explain what the fault means.

Build an interactive technician-oriented diagnostic process from
the verified evidence.

Start with:

Fault / symptom
Give the verified meaning or technical description.

Then:

Online Troubleshooting Process

Step 1
Tell the technician exactly what should be checked first.

When appropriate, give branches such as:

If OK → continue to Step 2.
If NOT OK → state the likely issue and the next appropriate check.

Step 2
Give the next verified diagnostic check.

Continue step by step only as far as the available evidence supports.

The purpose is to create a diagnostic path:

fault
→ check
→ observed result
→ next check
→ probable cause
→ next action

Do NOT fabricate branches just to make the process look complete.

If a manual provides a page, section, parameter, connector,
measurement or test procedure, include it.

If the exact elevator model, controller, software version or other
information is necessary to continue safely and accurately, ask
for that specific information at the relevant point.

ANSWER STYLE:

- Answer in the same language as the user's question.
- Write for a working elevator technician.
- Be concise but technically useful.
- Prefer actionable checks over generic explanations.
- Distinguish verified facts from probable causes.
- Do not add generic AI disclaimers.
- Do not add unnecessary introductory or closing text.

Do not create a References section inside the answer text.
References are handled separately by the application.

User question:
${question}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          tools: [
            {
              google_search: {},
            },
          ],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 1800,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error:", errorText);

      return NextResponse.json(
        { error: "The AI service could not answer this request." },
        { status: 502 }
      );
    }

    const data = await response.json();

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("")
        .trim() || "No verified answer was returned.";

    const grounding =
      data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const sources = grounding
      .filter((chunk: any) => chunk?.web?.uri && chunk?.web?.title)
      .map((chunk: any) => ({
        title: chunk.web.title,
        url: chunk.web.uri,
      }))
      .filter(
        (source: any, index: number, arr: any[]) =>
          arr.findIndex((x) => x.url === source.url) === index
      )
      .slice(0, 8);

    return NextResponse.json({
      answer,
      sources,
      disclosure:
        "Technical information is gathered from publicly available online sources and technical documentation."
    });

  } catch (error) {
    console.error("Ask API error:", error);

    return NextResponse.json(
      { error: "Something went wrong while processing the question." },
      { status: 500 }
    );
  }
}
