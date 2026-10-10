import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const health = read("app/api/health/gemini/route.ts");
assert.doesNotMatch(health, /generativelanguage\.googleapis\.com|generateContent/);

const config = read("next.config.ts");
for (const header of [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
]) {
  assert.match(config, new RegExp(header));
}

const diagnosticAuth = read("app/lib/diagnostic-auth.ts");
assert.match(diagnosticAuth, /DIAGNOSTICS_ENABLED/);
for (const route of [
  "drive-download-test",
  "drive-test-file",
  "drive-test",
  "embedding-test",
  "enrich-test",
  "ingest-test",
  "pdf-text-test",
  "retrieve-test",
  "router-test",
]) {
  assert.match(
    read(`app/api/${route}/route.ts`),
    /denyDiagnosticRequest\(request\)/,
    `${route} must enforce the diagnostic authorization guard`,
  );
}

const requestAuth = read("app/lib/request-auth.ts");
assert.match(requestAuth, /verifyToken/);
assert.match(requestAuth, /authorizedParties/);

const ask = read("app/api/ask/route.ts");
assert.match(ask, /ASK_RATE_LIMITED/);
assert.match(ask, /createGeminiCallBudget/);
assert.match(ask, /Request is too large/);
assert.match(ask, /cf-connecting-ip/);

const page = read("app/page.tsx");
assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB/i);

for (const workflow of readdirSync(new URL("../.github/workflows", import.meta.url))) {
  if (!workflow.endsWith(".yml")) continue;
  const source = read(`.github/workflows/${workflow}`);
  assert.doesNotMatch(source, /uses:\s+actions\/(?:checkout|setup-node|cache)(?:\/\w+)?@v\d+/);
}

console.log("PASS: security baseline and non-persistent chat policy are enforced.");
