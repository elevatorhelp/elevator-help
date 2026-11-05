import assert from "node:assert/strict";
import { authorizeChatRequest } from "../app/lib/request-auth.ts";

const request = new Request("https://elevator.help/api/ask", {
  method: "POST",
});

const previousRequired = process.env.AUTH_REQUIRED;
const previousSecret = process.env.CLERK_SECRET_KEY;

try {
  process.env.AUTH_REQUIRED = "false";
  assert.deepEqual(await authorizeChatRequest(request), {
    ok: true,
    userId: null,
  });

  delete process.env.AUTH_REQUIRED;
  delete process.env.CLERK_SECRET_KEY;
  const missingFlag=await authorizeChatRequest(request);
  assert.equal(missingFlag.ok,false,"undefined auth flag must fail closed");
  if(!missingFlag.ok)assert.equal(missingFlag.status,503);

  process.env.AUTH_REQUIRED = "tru";
  const mistypedFlag=await authorizeChatRequest(request);
  assert.equal(mistypedFlag.ok,false,"mistyped auth flag must fail closed");
  if(!mistypedFlag.ok)assert.equal(mistypedFlag.status,503);

  process.env.AUTH_REQUIRED = "true";
  delete process.env.CLERK_SECRET_KEY;
  const unavailable = await authorizeChatRequest(request);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.status, 503);

  process.env.CLERK_SECRET_KEY = "test_only_not_a_real_secret";
  const bearerRequest = new Request("https://elevator.help/api/ask", {
    method: "POST",
    headers: { authorization: "Bearer header.payload.signature" },
  });
  let verificationCalls = 0;
  const goodVerifier = (async (token: string, options: { secretKey?: string; authorizedParties?: string[] }) => {
    verificationCalls++;
    assert.equal(token, "header.payload.signature");
    assert.equal(options.secretKey, "test_only_not_a_real_secret");
    assert.deepEqual(options.authorizedParties, ["https://elevator.help"]);
    // Pinned Clerk verifyToken returns verified claims inside JwtReturnType.data.
    return { data: { sub: "user_ABC12345678", sid: "sess_ABC12345678" }, errors: undefined };
  }) as unknown as typeof import("@clerk/backend").verifyToken;
  assert.deepEqual(await authorizeChatRequest(bearerRequest, goodVerifier), {
    ok: true,
    userId: "user_ABC12345678",
  });
  assert.equal(verificationCalls, 1);
  for (const invalidClaims of [
    { sub: "user_ABC12345678", sid: "sess_ABC12345678" },
    { errors: [{ code: "token_invalid" }] },
    { data: { sub: "user_ABC12345678" } },
    { data: { sid: "sess_ABC12345678" } },
    { data: { sub: "not_a_user", sid: "sess_ABC12345678" } },
    { data: { sub: "user_ABC12345678", sid: "not_a_session" } },
    null,
  ]) {
    const fake = (async () => invalidClaims) as unknown as typeof import("@clerk/backend").verifyToken;
    const denied = await authorizeChatRequest(bearerRequest, fake);
    assert.equal(denied.ok, false, "invalid or unverified claims must fail closed");
    if (!denied.ok) assert.equal(denied.status, 401);
  }
  const rejectingVerifier = (async () => { throw Error("invalid_signature"); }) as unknown as typeof import("@clerk/backend").verifyToken;
  const badSignature = await authorizeChatRequest(bearerRequest, rejectingVerifier);
  assert.equal(badSignature.ok, false);
  if (!badSignature.ok) assert.equal(badSignature.status, 401);

  const unsigned = await authorizeChatRequest(request);
  assert.equal(unsigned.ok, false);
  if (!unsigned.ok) assert.equal(unsigned.status, 401);
} finally {
  if (previousRequired === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = previousRequired;
  if (previousSecret === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = previousSecret;
}

console.log("PASS: chat auth is fail-closed when account access is enabled.");
