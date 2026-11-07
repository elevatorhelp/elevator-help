import assert from "node:assert/strict";
import { normalizeEdgeTraffic, readEdgeTraffic } from "../app/lib/admin-cloudflare-analytics.ts";

const start = "2026-11-01T00:00:00.000Z", end = "2026-11-08T00:00:00.000Z";
assert.equal(normalizeEdgeTraffic(null, start, end).visits, null);
assert.equal(normalizeEdgeTraffic({ errors: [{ message: "wrong scope" }] }, start, end).visits, null);
const sample = { data: { viewer: { zones: [{ totals: [{ sum: { visits: 120 } }],
  countries: [{ dimensions: { clientCountryName: "Germany" }, sum: { visits: 62 } },
    { dimensions: { clientCountryName: "France" }, sum: { visits: 32 } },
    { dimensions: { clientCountryName: "invalid<script>" }, sum: { visits: 9 } }] }] } } };
const result = normalizeEdgeTraffic(sample, start, end);
assert.equal(result.visits, 120);
assert.deepEqual(result.countries, [{ country: "Germany", visits: 62 }, { country: "France", visits: 32 }]);
assert.equal(result.source, "cloudflare_http_requests_adaptive");
assert.match(result.warning ?? "", /20 highest-ranked country groups/);
assert.match(result.warning ?? "", /7-day window/);
assert.match(result.warning ?? "", /not unique visitors/);
let calls = 0;
const fetchImpl = (async (_url: string, init: RequestInit) => {
  calls++;
  const body = JSON.parse(String(init.body)) as { query: string; variables: { zoneTag: string; start: string; end: string } };
  assert.equal(body.variables.zoneTag, "a".repeat(32));
  assert.ok(body.query.includes('clientRequestHTTPHost: "elevator.help"'));
  assert.ok(body.query.includes("clientCountryName"));
  assert.ok(!body.query.includes("clientIP"));
  return new Response(JSON.stringify(sample), { status: 200 });
}) as typeof fetch;
assert.equal(await readEdgeTraffic({ zoneId: undefined, token: "test", fetchImpl }), null);
assert.equal(await readEdgeTraffic({ zoneId: "invalid", token: "test", fetchImpl }), null);
assert.equal(await readEdgeTraffic({ zoneId: "a".repeat(32), token: undefined, fetchImpl }), null);
assert.equal(calls, 0, "No network request without valid optional config");
const connected = await readEdgeTraffic({ zoneId: "a".repeat(32), token: "test", now: new Date(end), fetchImpl });
assert.equal(connected?.visits, 120);
assert.equal(calls, 1);
const badFetch = (async () => new Response("{}", {status:403})) as typeof fetch;
assert.equal(await readEdgeTraffic({ zoneId: "a".repeat(32), token: "test", fetchImpl:badFetch }), null);
console.log("Admin Cloudflare Analytics offline/mock tests PASS.");
