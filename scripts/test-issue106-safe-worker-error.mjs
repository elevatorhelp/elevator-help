import assert from "node:assert/strict";
import {redactQa106WorkerLog} from "./qa-issue106-safe-worker-error.mjs";
const secret="private-token-ABC-123 and PDF text: SECRET_SOURCE_QA106_WHATEVER";
const input="Ingestion phase preference: evidence; selected: raw\n"+
  "Gemini calls reserved: 2/4. "+secret+"\n"+
  "V2_MAP_GEMINI_RATE_LIMITED (source details redacted)\n";
const x=redactQa106WorkerLog(input);
assert.equal(x,"selected=raw reserved=2/4 markers=V2_MAP_GEMINI_RATE_LIMITED");
assert.ok(!x.includes(secret) && !x.includes("PRIVATE") && !x.includes("SOURCE"));
assert.equal(redactQa106WorkerLog(secret),"selected=unknown reserved=unknown markers=NONE_ALLOWLISTED");
assert.equal(redactQa106WorkerLog("Gemini calls reserved: 999/999\n"+secret),
"selected=unknown reserved=unknown markers=NONE_ALLOWLISTED");
console.log("PASS: Issue106 private Worker failure details remain redacted");
