import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {parseQaDriveRecoveryResponse} from "./qa-drive-recovery-response.mjs";

test("a JSON body cannot turn a 409 conflict into HTTP 200", async () => {
  const result = await parseQaDriveRecoveryResponse(new Response(JSON.stringify({status:200,error:"STALE_LEASE"}), {status:409}));
  assert.equal(result.status,409);
  assert.equal(result.error,"STALE_LEASE");
});

test("a JSON body cannot turn HTTP 200 into a 409 conflict", async () => {
  const result = await parseQaDriveRecoveryResponse(new Response(JSON.stringify({status:409,lease:{generation:3}}), {status:200}));
  assert.equal(result.status,200);
  assert.equal(result.lease.generation,3);
});

test("response without body status retains HTTP status and data", async () => {
  const result = await parseQaDriveRecoveryResponse(new Response(JSON.stringify({ok:true,lease:{owner:"qa"}}), {status:200}));
  assert.equal(result.status,200);
  assert.equal(result.lease.owner,"qa");
});

test("malformed JSON object shape fails closed", async () => {
  await assert.rejects(parseQaDriveRecoveryResponse(new Response("[]",{status:200})), /QA_DRIVE_RESPONSE_NOT_OBJECT/);
  await assert.rejects(parseQaDriveRecoveryResponse(new Response("null",{status:200})), /QA_DRIVE_RESPONSE_NOT_OBJECT/);
});

// Guard the real-app QA caller, not only the shared response parser.
test("full-app QA runner cannot accept a JSON-forged HTTP status", () => {
  const source = readFileSync(new URL("./qa-pr61-full-app-e2e.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{parseQaDriveRecoveryResponse\} from "\.\/qa-drive-recovery-response\.mjs"/);
  assert.match(source, /return await parseQaDriveRecoveryResponse\(response\)/);
  assert.doesNotMatch(source, /return\s*\{\s*status\s*:\s*response\.status\s*,\s*\.\.\./);
});
