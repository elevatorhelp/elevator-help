import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // This endpoint is intentionally local-only. A public health probe must not
  // spend Gemini quota or become a denial-of-wallet primitive.
  const configured = Boolean(process.env.GEMINI_API_KEY);
  return NextResponse.json(
    {
      ok: configured,
      stage: configured ? "ready" : "configuration",
      code: configured ? undefined : "missing_ai_configuration",
    },
    {
      status: configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
