import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/standards-engine.ts";
let source = await readFile(path, "utf8");

if (!source.includes('console.error("Standards metadata-filter query failed; falling back safely"')) {
  throw new Error("Raw standards metadata fallback is missing; refusing unsafe patch.");
}
if (!source.includes('match?.metadata?.contentType !== "document-map"')) {
  throw new Error("Document-map evidence exclusion is missing; refusing unsafe patch.");
}

const start = source.indexOf("async function discoverMapQueries(");
const end = source.indexOf("\n\nasync function rawMatchesForQuery", start);
if (start < 0 || end < 0) {
  throw new Error("Could not locate document-map discovery function; refusing unsafe patch.");
}

const current = source.slice(start, end);
if (current.includes("stable English engineering topic probes")) {
  console.log("Multilingual-safe document-map discovery already applied.");
  process.exit(0);
}

const replacement = [
  "async function discoverMapQueries(",
  "  question: string,",
  "  standard: (typeof CORE_STANDARDS)[number],",
  "  ai: any,",
  "  vectorize: any",
  ") {",
  "  try {",
  "    // The active Vectorize index uses the English BGE embedding model. Search the",
  "    // map with the original wording plus stable English engineering topic probes",
  "    // so German/Persian user wording can still reach English map nodes. These map",
  "    // nodes only create retrieval queries; they never become normative evidence.",
  "    const discoveryTexts = [`${question}\\n${standard.code}`];",
  "    if (isBroadShaftQuestion(question)) {",
  "      discoveryTexts.push(",
  "        `elevator shaft walls structural strength ${standard.code}` ,",
  "        `elevator shaft pit refuge space clearances ${standard.code}` ,",
  "        `elevator shaft headroom car roof refuge space ${standard.code}` ,",
  "        `elevator shaft lighting illumination ${standard.code}` ,",
  "        `elevator shaft access inspection emergency doors ${standard.code}` ,",
  "        `multiple lifts common shaft partition separation ${standard.code}`",
  "      );",
  "    }",
  "",
  "    const embeddingResult = await ai.run(\"@cf/baai/bge-base-en-v1.5\", {",
  "      text: discoveryTexts,",
  "    });",
  "    const queryVectors = (embeddingResult as any).data;",
  "    if (!Array.isArray(queryVectors) || !queryVectors.length) return [] as PlannedQuery[];",
  "",
  "    const seenMatchIds = new Set<string>();",
  "    const matches: any[] = [];",
  "",
  "    for (const queryVector of queryVectors) {",
  "      if (!queryVector) continue;",
  "      let currentMatches: any[] = [];",
  "      try {",
  "        const filtered = await vectorize.query(queryVector, {",
  "          topK: 30,",
  "          returnMetadata: \"all\",",
  "          filter: { contentType: \"document-map\" },",
  "        });",
  "        currentMatches = filtered.matches || [];",
  "      } catch (error) {",
  "        console.error(\"Standards document-map metadata filter failed; using local filtering\", {",
  "          standard: standard.code,",
  "          message: error instanceof Error ? error.message : String(error),",
  "        });",
  "        const unfiltered = await vectorize.query(queryVector, {",
  "          topK: 50,",
  "          returnMetadata: \"all\",",
  "        });",
  "        currentMatches = (unfiltered.matches || []).filter(",
  "          (match: any) => match?.metadata?.contentType === \"document-map\"",
  "        );",
  "      }",
  "",
  "      for (const match of currentMatches) {",
  "        const key = matchKey(match);",
  "        if (seenMatchIds.has(key)) continue;",
  "        seenMatchIds.add(key);",
  "        matches.push(match);",
  "      }",
  "    }",
  "",
  "    const seen = new Set<string>();",
  "    const queries: PlannedQuery[] = [];",
  "    for (const match of matches) {",
  "      const query = mapMatchToQuery(match, standard);",
  "      if (!query) continue;",
  "      const key = `${query.topic}:${query.query.toLowerCase()}`;",
  "      if (seen.has(key)) continue;",
  "      seen.add(key);",
  "      queries.push(query);",
  "      if (queries.length >= (isBroadShaftQuestion(question) ? 14 : 6)) break;",
  "    }",
  "    return queries;",
  "  } catch (error) {",
  "    console.error(\"Standards map discovery error:\", {",
  "      standard: standard.code,",
  "      message: error instanceof Error ? error.message : String(error),",
  "    });",
  "    return [] as PlannedQuery[];",
  "  }",
  "}",
].join("\n");

source = source.slice(0, start) + replacement + source.slice(end);
await writeFile(path, source, "utf8");
console.log("Applied multilingual-safe document-map discovery without changing the evidence verifier.");
