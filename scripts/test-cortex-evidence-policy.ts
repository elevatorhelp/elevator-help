import assert from "node:assert/strict";
import { shouldUsePublicWebFallback } from "../app/lib/cortex-evidence-policy.ts";

const base = {
  evidenceNeed: "direct",
  explicitWebRequest: false,
  internalEvidenceMissing: false,
  requiredVerificationMissing: false,
};

assert.equal(shouldUsePublicWebFallback(base), false);
assert.equal(
  shouldUsePublicWebFallback({ ...base, evidenceNeed: "web_current" }),
  true,
);
assert.equal(
  shouldUsePublicWebFallback({ ...base, internalEvidenceMissing: true }),
  true,
  "Any technical archive miss must fall back to public web research",
);
assert.equal(
  shouldUsePublicWebFallback({ ...base, requiredVerificationMissing: true }),
  true,
  "Missing required evidence must fall back to public web research",
);

console.log("PASS: Cortex archive misses consistently fall back to the web");
