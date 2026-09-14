import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/standards-engine.ts";
let source = await readFile(path, "utf8");
let changed = false;

const oldRawBlock = `  const queryWithFilter = async (filter?: Record<string, string>) => {
    const result = await vectorize.query(queryVector, {
      topK: 50,
      returnMetadata: "all",
      ...(filter ? { filter } : {}),
    });

    return (result.matches || [])
      .filter(
        (match: any) =>
          match?.metadata?.contentType !== "document-map" &&
          typeof match?.metadata?.text === "string" &&
          match.metadata.text.trim().length > 0 &&
          matchBelongsToStandard(match, standard.compact) &&
          Number(match?.score || 0) >= minimumScore
      )
      .sort((a: any, b: any) => matchRank(b) - matchRank(a))
      .slice(0, 6)
      .map((match: any) => ({
        ...match,
        standardSearchTopic: item.topic,
        standardSearchQuery: item.query,
      }));
  };`;

const newRawBlock = `  const queryWithFilter = async (filter?: Record<string, string>) => {
    try {
      const result = await vectorize.query(queryVector, {
        topK: 50,
        returnMetadata: "all",
        ...(filter ? { filter } : {}),
      });

      return (result.matches || [])
        .filter(
          (match: any) =>
            match?.metadata?.contentType !== "document-map" &&
            typeof match?.metadata?.text === "string" &&
            match.metadata.text.trim().length > 0 &&
            matchBelongsToStandard(match, standard.compact) &&
            Number(match?.score || 0) >= minimumScore
        )
        .sort((a: any, b: any) => matchRank(b) - matchRank(a))
        .slice(0, 6)
        .map((match: any) => ({
          ...match,
          standardSearchTopic: item.topic,
          standardSearchQuery: item.query,
        }));
    } catch (error) {
      if (filter) {
        console.error("Standards metadata-filter query failed; falling back safely", {
          filter,
          standard: standard.code,
          message: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
      throw error;
    }
  };`;

if (!source.includes(newRawBlock)) {
  if (!source.includes(oldRawBlock)) {
    throw new Error("Expected raw queryWithFilter block not found; refusing unsafe patch.");
  }
  source = source.replace(oldRawBlock, newRawBlock);
  changed = true;
}

const oldMapBlock = `    const result = await vectorize.query(queryVector, {
      topK: 20,
      returnMetadata: "all",
      filter: { contentType: "document-map" },
    });

    const seen = new Set<string>();
    const queries: PlannedQuery[] = [];
    for (const match of result.matches || []) {`;

const newMapBlock = `    let matches: any[] = [];
    try {
      const filtered = await vectorize.query(queryVector, {
        topK: 30,
        returnMetadata: "all",
        filter: { contentType: "document-map" },
      });
      matches = filtered.matches || [];
    } catch (error) {
      console.error("Standards document-map metadata filter failed; using local filtering", {
        standard: standard.code,
        message: error instanceof Error ? error.message : String(error),
      });
      const unfiltered = await vectorize.query(queryVector, {
        topK: 50,
        returnMetadata: "all",
      });
      matches = (unfiltered.matches || []).filter(
        (match: any) => match?.metadata?.contentType === "document-map"
      );
    }

    const seen = new Set<string>();
    const queries: PlannedQuery[] = [];
    for (const match of matches) {`;

if (!source.includes(newMapBlock)) {
  if (!source.includes(oldMapBlock)) {
    throw new Error("Expected document-map query block not found; refusing unsafe patch.");
  }
  source = source.replace(oldMapBlock, newMapBlock);
  changed = true;
}

const oldDiscoveryBlock = `async function discoverMapQueries(
  question: string,
  standard: (typeof CORE_STANDARDS)[number],
  ai: any,
  vectorize: any
) {
  try {
    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: [\`${question}\\n${standard.code}\`],
    });
    const queryVector = (embeddingResult as any).data?.[0];
    if (!queryVector) return [] as PlannedQuery[];

    let matches: any[] = [];
    try {
      const filtered = await vectorize.query(queryVector, {
        topK: 30,
        returnMetadata: "all",
        filter: { contentType: "document-map" },
      });
      matches = filtered.matches || [];
    } catch (error) {
      console.error("Standards document-map metadata filter failed; using local filtering", {
        standard: standard.code,
        message: error instanceof Error ? error.message : String(error),
      });
      const unfiltered = await vectorize.query(queryVector, {
        topK: 50,
        returnMetadata: "all",
      });
      matches = (unfiltered.matches || []).filter(
        (match: any) => match?.metadata?.contentType === "document-map"
      );
    }

    const seen = new Set<string>();
    const queries: PlannedQuery[] = [];
    for (const match of matches) {
      const query = mapMatchToQuery(match, standard);
      if (!query) continue;
      const key = \`${query.topic}:${query.query.toLowerCase()}\`;
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(query);
      if (queries.length >= 6) break;
    }
    return queries;
  } catch (error) {
    console.error("Standards map discovery error:", {
      standard: standard.code,
      message: error instanceof Error ? error.message : String(error),
    });
    return [] as PlannedQuery[];
  }
}`;

const newDiscoveryBlock = `async function discoverMapQueries(
  question: string,
  standard: (typeof CORE_STANDARDS)[number],
  ai: any,
  vectorize: any
) {
  try {
    // The active Vectorize index uses the English BGE embedding model. Search the
    // map with the original wording plus stable English engineering topic probes
    // so German/Persian user wording can still reach English map nodes. These map
    // nodes only create retrieval queries; they never become normative evidence.
    const discoveryTexts = [\`${question}\\n${standard.code}\`];
    if (isBroadShaftQuestion(question)) {
      discoveryTexts.push(
        \`elevator shaft walls structural strength ${standard.code}\`,
        \`elevator shaft pit refuge space clearances ${standard.code}\`,
        \`elevator shaft headroom car roof refuge space ${standard.code}\`,
        \`elevator shaft lighting illumination ${standard.code}\`,
        \`elevator shaft access inspection emergency doors ${standard.code}\`,
        \`multiple lifts common shaft partition separation ${standard.code}\`
      );
    }

    const embeddingResult = await ai.run("@cf/baai/bge-base-en-v1.5", {
      text: discoveryTexts,
    });
    const queryVectors = (embeddingResult as any).data;
    if (!Array.isArray(queryVectors) || !queryVectors.length) return [] as PlannedQuery[];

    const seenMatchIds = new Set<string>();
    const matches: any[] = [];

    for (const queryVector of queryVectors) {
      if (!queryVector) continue;
      let currentMatches: any[] = [];
      try {
        const filtered = await vectorize.query(queryVector, {
          topK: 30,
          returnMetadata: "all",
          filter: { contentType: "document-map" },
        });
        currentMatches = filtered.matches || [];
      } catch (error) {
        console.error("Standards document-map metadata filter failed; using local filtering", {
          standard: standard.code,
          message: error instanceof Error ? error.message : String(error),
        });
        const unfiltered = await vectorize.query(queryVector, {
          topK: 50,
          returnMetadata: "all",
        });
        currentMatches = (unfiltered.matches || []).filter(
          (match: any) => match?.metadata?.contentType === "document-map"
        );
      }

      for (const match of currentMatches) {
        const key = matchKey(match);
        if (seenMatchIds.has(key)) continue;
        seenMatchIds.add(key);
        matches.push(match);
      }
    }

    const seen = new Set<string>();
    const queries: PlannedQuery[] = [];
    for (const match of matches) {
      const query = mapMatchToQuery(match, standard);
      if (!query) continue;
      const key = \`${query.topic}:${query.query.toLowerCase()}\`;
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push(query);
      if (queries.length >= (isBroadShaftQuestion(question) ? 14 : 6)) break;
    }
    return queries;
  } catch (error) {
    console.error("Standards map discovery error:", {
      standard: standard.code,
      message: error instanceof Error ? error.message : String(error),
    });
    return [] as PlannedQuery[];
  }
}`;

if (!source.includes(newDiscoveryBlock)) {
  if (!source.includes(oldDiscoveryBlock)) {
    throw new Error("Expected document-map discovery function not found; refusing unsafe patch.");
  }
  source = source.replace(oldDiscoveryBlock, newDiscoveryBlock);
  changed = true;
}

if (!changed) {
  console.log("Standards retrieval safety fallbacks and multilingual-safe map discovery already applied.");
  process.exit(0);
}

await writeFile(path, source, "utf8");
console.log("Applied safe standards metadata fallbacks and multilingual-safe document-map discovery.");
