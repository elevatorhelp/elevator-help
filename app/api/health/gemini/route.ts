import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, stage: "configuration", code: "missing_api_key" }, { status: 503 });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Return exactly: OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 8 },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      let upstreamStatus = response.status;
      let upstreamCode = "gemini_http_error";
      try {
        const parsed = JSON.parse(raw);
        upstreamCode = parsed?.error?.status || upstreamCode;
      } catch {}
      return NextResponse.json(
        { ok: false, stage: "gemini", upstreamStatus, code: upstreamCode },
        { status: 503 }
      );
    }

    const data: any = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      return NextResponse.json(
        { ok: false, stage: "gemini", code: "empty_response" },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, stage: "gemini", model: "gemini-2.5-flash" });
  } catch {
    return NextResponse.json(
      { ok: false, stage: "network", code: "gemini_fetch_failed" },
      { status: 503 }
    );
  }
}
