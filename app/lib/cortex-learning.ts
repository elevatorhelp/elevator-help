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

// A conservative storage guard: questionable user-derived metadata is dropped,
// never logged or saved. This is not a universal PII classifier.
function containsSensitiveData(value: string) {
  const text = value.normalize("NFKC");
  return (
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text) ||
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text) ||
    /(?:^|[^\d])\+?\d[\d ()-]{8,}\d(?:[^\d]|$)/.test(text) ||
    /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i.test(text) ||
    /\b(?:password|passwort|kennwort|api[\s_-]?key|secret|bearer|access[\s_-]?token|refresh[\s_-]?token|private[\s_-]?key|passport|reisepass|iban|credit[\s_-]?card|kreditkarte)\b/i.test(text) ||
    /\b(?:my name is|mein name ist|my address is|meine adresse ist)\b/i.test(text) ||
    /(?:اسم من|آدرس من|شماره تلفن من)/.test(text) ||
    /\b\d{5}\s+[\p{L}][\p{L}-]+/u.test(text) ||
    /\b[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/i.test(text)
  );
}

function safeResearchQuery(query: string) {
  const normalized = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 500 || containsSensitiveData(normalized)) {
    return null;
  }
  // Keep only plain search text, not URLs or markup.
  if (/https?:\/\/|www\.|[<>]/i.test(normalized)) return null;
  return normalized;
}

function safePublicSource(uri: string) {
  try {
    const url = new URL(uri);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (
      !host.includes(".") ||
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^\d+(?:\.\d+){3}$/.test(host)
    ) return null;
    // Paths may embed personal identifiers or access tokens.
    const path = decodeURIComponent(url.pathname);
    if (
      path.length > 1000 ||
      containsSensitiveData(path) ||
      /\/(?:users?|profiles?|accounts?|sessions?|tokens?|auth|login)\//i.test(path) ||
      /\/[a-z0-9_-]{32,}(?:\/|$)/i.test(path)
    ) return null;
    // Do not persist query parameters, fragments or potentially private titles.
    url.search = "";
    url.hash = "";
    return { uri: url.toString(), title: null };
  } catch {
    return null;
  }
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
  const queries = [...new Set(trace.queries.map(safeResearchQuery))]
    .filter((item): item is string => item !== null)
    .slice(0, 8);
  const sources = trace.sources
    .map((item) => safePublicSource(item.uri))
    .filter((item): item is { uri: string; title: null } => item !== null)
    .slice(0, 12);
  if (!queries.length)
    return { stored: false, reason: "privacy-filtered" };
  if (!sources.length)
    return { stored: false, reason: "no-safe-sources" };

  const researchQuery = queries.join(" | ").slice(0, 1500);
  const sourceRefsJson = JSON.stringify(sources);
  if (sourceRefsJson.length > 12_000)
    return { stored: false, reason: "oversized-source-metadata" };
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
