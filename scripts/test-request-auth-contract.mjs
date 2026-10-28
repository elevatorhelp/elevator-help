import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

// Offline SDK boundary test: execute the real authorization function, replacing
// only Clerk's network-capable verifier. This is NOT a real Clerk session test.
let calls = [];
let payload = { sub: "synthetic-user" };
let rejected = false;
globalThis.__offlineClerkVerify = async (token, options) => {
  calls.push({ token, options });
  if (rejected) throw Error("synthetic SDK rejection");
  return payload;
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@clerk/backend") return {
      url: "data:text/javascript,export const verifyToken = (...args) => globalThis.__offlineClerkVerify(...args);",
      shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
const previous = { required: process.env.AUTH_REQUIRED, secret: process.env.CLERK_SECRET_KEY };
try {
  const { authorizeChatRequest } = await import("../app/lib/request-auth.ts");
  process.env.AUTH_REQUIRED = "true";
  process.env.CLERK_SECRET_KEY = "synthetic-only-never-a-real-secret";
  const request = (authorization) => new Request("https://elevator.help/api/ask", {
    headers: authorization ? { authorization } : {},
  });
  assert.deepEqual(await authorizeChatRequest(request("Bearer synthetic-session")), {
    ok: true, userId: "synthetic-user",
  });
  assert.deepEqual(calls, [{ token: "synthetic-session", options: {
    secretKey: "synthetic-only-never-a-real-secret", authorizedParties: ["https://elevator.help"],
  } }], "the SDK must receive the bearer token and actual request origin");
  calls = [];
  for (const header of [undefined, "Basic synthetic-session", "Bearer "]) {
    assert.equal((await authorizeChatRequest(request(header))).status, 401);
  }
  assert.equal(calls.length, 0, "unsigned requests must not reach Clerk");
  payload = {};
  assert.equal((await authorizeChatRequest(request("Bearer no-subject"))).status, 401);
  rejected = true;
  assert.equal((await authorizeChatRequest(request("Bearer invalid-session"))).status, 401);
  delete process.env.CLERK_SECRET_KEY;
  assert.equal((await authorizeChatRequest(request("Bearer unavailable"))).status, 503);

  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const auth = route.indexOf("await authorizeChatRequest(request)");
  assert.ok(auth >= 0 && auth < route.indexOf("await request.json()"));
  assert.match(route.slice(auth, route.indexOf("await request.json()")), /if \(!authorization\.ok\)/);
  // A missing Gemini key must NEVER forward customer question/history from
  // a preview or isolated QA origin to the production /api/ask endpoint.
  // This is a static fail-closed guard, not a live Clerk/QA E2E test.
  assert.doesNotMatch(route, /proxyProductionAnswer|X-Elevator-Preview-Proxy|https:\/\/elevator\\.help\/api\/ask/,
    "the chat route must not proxy customer conversations to production");
  const missingKeyStart = route.indexOf("    if (!key) {");
  const missingKeyEnd = route.indexOf("    if (asksResponseProvenance(question))", missingKeyStart);
  assert.ok(missingKeyStart >= 0 && missingKeyEnd > missingKeyStart,
    "the missing-Gemini-key branch must remain explicit");
  const missingKeyBranch = route.slice(missingKeyStart, missingKeyEnd);
  assert.match(missingKeyBranch, /retrieveFaultEvidenceWithoutGemini\\(question\\)/,
    "local evidence may still be used without Gemini");
  assert.match(missingKeyBranch, /return NextResponse\\.json\\(\\s*\\{ error: "AI is not configured\\." \\}/,
    "missing configuration must return a local error, not delegate");
  assert.doesNotMatch(missingKeyBranch, /\\bfetch\\s*\\(/,
    "missing-Gemini-key branch must not make an outbound fetch");
  const client = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(client, /getAuthToken=\{getToken\}/);
  assert.match(client, /Authorization: `Bearer \$\{authToken\}`/);
  console.log("PASS: real auth function accepts SDK-verified subject, passes origin/token, rejects missing/invalid sessions; Clerk SDK mocked, no live session asserted");
} finally {
  hooks.deregister();
  delete globalThis.__offlineClerkVerify;
  if (previous.required === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = previous.required;
  if (previous.secret === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = previous.secret;
}
