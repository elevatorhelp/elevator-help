import assert from "node:assert/strict";
import { authorizeAdminRequest } from "../app/lib/admin-authorization.ts";

const req = (token?: string) => new Request("https://elevator.help/api/admin/status", {
  headers: token ? { Authorization: "Bearer " + token } : {},
});
const token = "valid-signed-token-placeholder";
const payload = { sub: "user_ABC123", sid: "sess_123", azp: "https://elevator.help" };
const fakeVerifier = async () => payload;
const configured = { secret: "sk_test_fixture", allowedIds: "user_ABC123" };

assert.deepEqual(await authorizeAdminRequest(req(token), { secret: undefined, allowedIds: "user_ABC123" }, fakeVerifier as never), { ok: false, status: 503 });
assert.deepEqual(await authorizeAdminRequest(req(token), { secret: "sk_test_fixture", allowedIds: "" }, fakeVerifier as never), { ok: false, status: 503 });
assert.deepEqual(await authorizeAdminRequest(req(), configured, fakeVerifier as never), { ok: false, status: 401 });
assert.deepEqual(await authorizeAdminRequest(req(token), configured, fakeVerifier as never), { ok: true });
assert.deepEqual(await authorizeAdminRequest(req(token), { ...configured, allowedIds: "user_SOMEONEELSE" }, fakeVerifier as never), { ok: false, status: 403 });
assert.deepEqual(await authorizeAdminRequest(req(token), configured, (async () => ({ data: payload, errors: null })) as never), { ok: true });
assert.deepEqual(await authorizeAdminRequest(req(token), configured, (async () => ({ data: payload, errors: [{ message: "invalid" }] })) as never), { ok: false, status: 401 });
assert.deepEqual(await authorizeAdminRequest(req(token), configured, (async () => ({ sub: "user_ABC123" })) as never), { ok: false, status: 401 });
assert.deepEqual(await authorizeAdminRequest(req(token), configured, (async () => { throw Error("bad signature"); }) as never), { ok: false, status: 401 });
assert.deepEqual(await authorizeAdminRequest(req(token), { ...configured, allowedIds: "not-an-id" }, fakeVerifier as never), { ok: false, status: 503 });


let verifierCalls = 0;
const verifyOptions = (async (received: string, options: { secretKey?: string; authorizedParties?: string[] }) => {
  verifierCalls++;
  assert.equal(received, token);
  assert.equal(options.secretKey, configured.secret);
  assert.deepEqual(options.authorizedParties, ["https://elevator.help"]);
  return { data: payload, errors: undefined };
}) as never;
assert.deepEqual(await authorizeAdminRequest(req(token), configured, verifyOptions), { ok: true });
assert.equal(verifierCalls, 1, "verified token must be checked exactly once");
for (const invalid of [
  { data: { sub: "user_ABC123" } },
  { data: { sid: "sess_123" } },
  { data: { sub: "user_ABC123", sid: "invalid" } },
  { data: { sub: "invalid", sid: "sess_123" } },
  { data: payload, errors: [{ code: "invalid_signature" }] },
  { errors: [{ code: "invalid_signature" }] },
  null,
]) {
  assert.deepEqual(await authorizeAdminRequest(req(token), configured, (async () => invalid) as never),
    { ok: false, status: 401 }, "malformed/failed verification must not authorize admin");
}
for (const badHeader of ["Basic " + token, "Bearer short", "Bearer " + token + " trailing"]) {
  assert.deepEqual(await authorizeAdminRequest(new Request("https://elevator.help/api/admin/status", {
    headers: { Authorization: badHeader },
  }), configured, (async () => { throw Error("verifier must not run"); }) as never),
    { ok: false, status: 401 }, "malformed authorization header must be rejected before verification");
}
assert.deepEqual(await authorizeAdminRequest(req(token), { ...configured, secret: "invalid" }, fakeVerifier as never),
  { ok: false, status: 503 }, "invalid secret configuration must fail closed");
assert.deepEqual(await authorizeAdminRequest(req(token), { ...configured, allowedIds: "invalid,other" }, fakeVerifier as never),
  { ok: false, status: 503 }, "invalid admin IDs must fail closed");

console.log("Admin access negative/positive fixtures PASS.");
