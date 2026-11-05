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
    const verifiedResult: unknown = await verifyToken(token, {
      secretKey,
      authorizedParties: [origin],
    });
    // verifyToken returns the signed JWT claims directly on success.
    // Do not treat them as an authenticateRequest() { data, errors } result:
    // doing so rejects even cryptographically verified sessions.
    if (!verifiedResult || typeof verifiedResult !== "object" || Array.isArray(verifiedResult))
      throw new Error("invalid_verification_result");
    const claims = verifiedResult as Record<string, unknown>;
    if (
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
