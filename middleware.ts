import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname !== "/api/ask") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/api/ask-v2";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/api/ask"],
};
