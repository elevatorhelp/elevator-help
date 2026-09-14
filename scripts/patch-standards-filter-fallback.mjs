import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/standards-engine.ts";
let source = await readFile(path, "utf8");
let changed = false;

const oldRawBlock = `  const queryWithFilter = async (filter?: Record<string, string>) => {
    const result = await vectorize.query(queryVector, {
      topK: 80,
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
        topK: 80,
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
        topK: 80,
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

if (!changed) {
  console.log("Standards raw and document-map filter fallbacks already applied.");
  process.exit(0);
}

await writeFile(path, source, "utf8");
console.log("Applied safe standards metadata-filter fallbacks for raw evidence and document-map discovery.");
