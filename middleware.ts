import { NextRequest, NextResponse } from "next/server";

const DIAGNOSTIC_ENDPOINTS = new Set([
  "/api/drive-download-test",
  "/api/drive-test-file",
  "/api/drive-test",
  "/api/embedding-test",
  "/api/enrich-test",
  "/api/ingest-test",
  "/api/pdf-text-test",
  "/api/retrieve-test",
  "/api/router-test",
]);

export function middleware(request: NextRequest) {
  if (DIAGNOSTIC_ENDPOINTS.has(request.nextUrl.pathname)) {
    const token = process.env.INGESTION_TOKEN;
    const authorization = request.headers.get("authorization");
    if (!token || authorization !== `Bearer ${token}`) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
