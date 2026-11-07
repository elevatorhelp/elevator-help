import { verifyToken } from "@clerk/backend";

type VerificationResult = { ok: true } | { ok: false; status: 401 | 403 | 503 };

export async function authorizeAdminRequest(
  request: Request,
  env: { secret?: string; allowedIds?: string },
  verifier: typeof verifyToken = verifyToken,
): Promise<VerificationResult> {
  // No configured admin identity means no admin, never open access.
  const allowed = new Set((env.allowedIds || "").split(/[\s,]+/).map(v => v.trim()).filter(v => /^user_[A-Za-z0-9]+$/.test(v)));
  if (!env.secret?.startsWith("sk_") || !allowed.size) return { ok: false, status: 503 };
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer ([^\s]{10,8000})$/.exec(auth);
  if (!match) return { ok: false, status: 401 };
  try {
    // Verify signature, expiry and authorized party with the Clerk SDK.
    const verified: unknown = await verifier(match[1], {
      secretKey: env.secret,
      authorizedParties: [new URL(request.url).origin],
    });
    if (!verified || typeof verified !== "object" || Array.isArray(verified)) return { ok: false, status: 401 };
    const result = verified as Record<string, unknown>;
    if (result.errors !== undefined && result.errors !== null) return { ok: false, status: 401 };
    const claims: unknown = Object.prototype.hasOwnProperty.call(result, "data") ? result.data : result;
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return { ok: false, status: 401 };
    const payload = claims as Record<string, unknown>;
    if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_") ||
        typeof payload.sid !== "string" || !payload.sid.startsWith("sess_")) return { ok: false, status: 401 };
    if (!allowed.has(payload.sub)) return { ok: false, status: 403 };
    return { ok: true };
  } catch {
    return { ok: false, status: 401 };
  }
}
