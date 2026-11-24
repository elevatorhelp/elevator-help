import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ask=readFileSync("app/api/ask/route.ts","utf8");
const cfg=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
assert.equal(cfg.vars?.QA106_ISOLATED_BINDINGS,"qa106-pr100-v2-only");
assert.equal(cfg.vars?.GEMINI_MAX_CALLS_PER_INGEST_REQUEST,"0");
const key=ask.indexOf("const key = process.env.GEMINI_API_KEY;");
const isolated=ask.indexOf('QA106_ISOLATED_BINDINGS === "qa106-pr100-v2-only"');
const exit=ask.indexOf('diagnosticCode: "QA106_ISOLATED_NO_MODEL"');
const proxy=ask.indexOf("return proxyProductionAnswer(question, history);");
assert.ok(key>0&&isolated>key&&exit>isolated&&proxy>exit,
 "Isolated QA fail-closed check must occur before Production proxy fallback");
assert.match(ask.slice(isolated,proxy),/status: 503/);
assert.match(ask.slice(isolated,proxy),/if \(!key\)/);
console.log("PASS:QA106_ISOLATED_NO_MODEL_ASK_NEVER_PROXY_PRODUCTION_STATIC_GUARD");
