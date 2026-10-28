import assert from "node:assert/strict";
import {test} from "node:test";
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
