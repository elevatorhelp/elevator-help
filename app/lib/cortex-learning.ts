export type WebResearchTrace = {
  queries: string[];
  sources: { uri: string; title: string | null }[];
};

function learningEnabled(env: any) {
  return (
    String(
      env?.CORTEX_LEARNING_ENABLED ?? process.env.CORTEX_LEARNING_ENABLED ?? "",
    ).toLowerCase() === "true"
  );
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function recordWebResearchCandidate(
  env: any,
  trace: WebResearchTrace,
) {
  if (!learningEnabled(env)) return { stored: false, reason: "disabled" };
  const database = env?.CORTEX_DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("CORTEX_LEARNING_DATABASE_NOT_CONFIGURED");
  }
  const queries = [...new Set(trace.queries.map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, 8);
  const sources = trace.sources
    .filter((item) => /^https?:\/\//i.test(item.uri))
    .slice(0, 12);
  if (!queries.length || !sources.length)
    return { stored: false, reason: "no-grounded-sources" };

  const researchQuery = queries.join(" | ").slice(0, 1500);
  const sourceRefsJson = JSON.stringify(sources).slice(0, 12_000);
  const fingerprint = await sha256(`${researchQuery}\n${sourceRefsJson}`);
  await database
    .prepare(
      `INSERT INTO learning_candidates
        (fingerprint, research_query, source_refs_json, status, seen_count, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, 'pending', 1, unixepoch(), unixepoch())
       ON CONFLICT(fingerprint) DO UPDATE SET
         seen_count = learning_candidates.seen_count + 1,
         last_seen_at = unixepoch()`,
    )
    .bind(fingerprint, researchQuery, sourceRefsJson)
    .run();
  return { stored: true, fingerprint };
}
