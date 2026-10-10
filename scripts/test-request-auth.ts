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

  process.env.AUTH_REQUIRED = "true";
  delete process.env.CLERK_SECRET_KEY;
  const unavailable = await authorizeChatRequest(request);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.status, 503);

  process.env.CLERK_SECRET_KEY = "test_only_not_a_real_secret";
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
