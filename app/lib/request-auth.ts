import { verifyToken } from "@clerk/backend";

type ChatAuthorization =
  | { ok: true; userId: string | null }
  | { ok: false; status: 401 | 503; error: string };

export async function authorizeChatRequest(
  request: Request,
  verifyImpl: typeof verifyToken = verifyToken,
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
    const verifiedResult: unknown = await verifyImpl(token, {
      secretKey,
      authorizedParties: [origin],
    });
    // Different Clerk SDK verification interfaces expose either a successful
    // JwtReturnType {data, errors} or the verified JwtPayload directly.
    // Both originate ONLY from verifyToken (signature, expiry, azp checked).
    // Never trust a decoded/unverified payload or silently ignore errors.
    if (!verifiedResult || typeof verifiedResult !== "object" || Array.isArray(verifiedResult))
      throw new Error("invalid_verification_result");
    const result = verifiedResult as Record<string, unknown>;
    if (result.errors !== undefined && result.errors !== null)
      throw new Error("token_not_verified");
    const candidate = "data" in result ? result.data : result;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      throw new Error("invalid_verified_claims");
    const claims = candidate as Record<string, unknown>;
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
