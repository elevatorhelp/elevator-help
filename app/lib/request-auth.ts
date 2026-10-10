import { verifyToken } from "@clerk/backend";

type ChatAuthorization =
  | { ok: true; userId: string | null }
  | { ok: false; status: 401 | 503; error: string };

export async function authorizeChatRequest(
  request: Request,
): Promise<ChatAuthorization> {
  if (process.env.AUTH_REQUIRED !== "true") {
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
    const payload = await verifyToken(token, {
      secretKey,
      authorizedParties: [origin],
    });
    if (!payload.sub) throw new Error("missing_subject");
    return { ok: true, userId: payload.sub };
  } catch {
    return { ok: false, status: 401, error: "Your session is not valid." };
  }
}
