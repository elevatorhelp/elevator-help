import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/standards-engine.ts";
const source = await readFile(path, "utf8");

const oldBlock = `  const queryWithFilter = async (filter?: Record<string, string>) => {
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

const newBlock = `  const queryWithFilter = async (filter?: Record<string, string>) => {
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

if (source.includes(newBlock)) {
  console.log("Standards filter fallback already applied.");
  process.exit(0);
}

if (!source.includes(oldBlock)) {
  throw new Error("Expected queryWithFilter block not found; refusing unsafe patch.");
}

await writeFile(path, source.replace(oldBlock, newBlock), "utf8");
console.log("Applied safe standards metadata-filter fallback.");
