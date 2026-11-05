import { verifyToken } from "@clerk/backend";

type ChatAuthorization =
  | { ok: true; userId: string | null }
  | { ok: false; status: 401 | 503; error: string };

export async function authorizeChatRequest(
  request: Request,
): Promise<ChatAuthorization> {
  // Only an explicit opt-out is allowed; a missing or misspelled flag fails closed.
  if (process.env.AUTH_REQUIRED === "false") {
    return { ok: true, userId: null };
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return {
      ok: false,
      status: 503,
      error: "Authentication is temporarily unavailable.",
    };
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) {
    return { ok: false, status: 401, error: "Please sign in." };
  }

  try {
    const origin = new URL(request.url).origin;
    const result = await verifyToken(token, {
      secretKey,
      authorizedParties: [origin],
    });
    // Clerk SDK returns { data, errors }, never a bare JWT payload.
    // Only accept an authenticated HUMAN session, not a machine token or a
    // decoded-but-unverified JWT. Missing/malformed results fail closed.
    if (result.errors?.length) throw new Error("token_not_verified");
    const claims = result.data;
    if (
      !claims ||
      typeof claims.sub !== "string" ||
      !claims.sub.startsWith("user_") ||
      typeof claims.sid !== "string" ||
      !claims.sid.startsWith("sess_")
    ) {
      throw new Error("invalid_session_claims");
    }
    return { ok: true, userId: claims.sub };
  } catch {
    return { ok: false, status: 401, error: "Your session is not valid." };
  }
}
