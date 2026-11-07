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

console.log("Admin access negative/positive fixtures PASS.");
