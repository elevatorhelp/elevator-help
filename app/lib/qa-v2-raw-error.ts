/**
 * Safe diagnostic codes for QA-only V2 RAW staging. Never return error.message,
 * model output, PDF text, credentials, URLs or provider responses to clients.
 * This intentionally does not change the Production serial ingest path.
 */
export type QaV2RawStage =
  "validation" | "lease_guard" | "gemini_enrichment" |
  "workers_ai_embedding" | "gemini_embedding" |
  "epoch_claim" | "vector_staging";
const phases:Record<QaV2RawStage,string>={
  validation:"VALIDATION",
  lease_guard:"LEASE_GUARD",
  gemini_enrichment:"GEMINI_ENRICHMENT",
  workers_ai_embedding:"WORKERS_AI_EMBEDDING",
  gemini_embedding:"GEMINI_EMBEDDING",
  epoch_claim:"EPOCH_CLAIM",
  vector_staging:"VECTOR_STAGING",
};
export function classifyQaV2RawError(stage:QaV2RawStage,error:unknown):string{
  const message=error instanceof Error?error.message:"";
  const isRate=/\b429\b|quota|rate.?limit|resource.?exhausted|too many requests/i.test(message);
  const isDenied=/\b(?:401|403)\b|permission.?denied|api.?key.?invalid|forbidden|unauthorized|GLOBAL_ARCHIVE_.*(?:DENIED|STALE|MISMATCH|REQUIRED)/i.test(message);
  const kind=isRate?"RATE_LIMITED":isDenied?"DENIED":"FAILED";
  return "V2_RAW_"+phases[stage]+"_"+kind;
}
