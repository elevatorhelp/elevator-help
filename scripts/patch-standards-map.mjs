import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/standards-engine.ts";
const source = await readFile(path, "utf8");

const oldBlock = `  const queryWithFilter = async (filter?: Record<string, string>) => {
    const result = await vectorize.query(queryVector, {
      topK: 40,
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
          Number(match?.score || 0) >= MIN_STANDARD_SCORE
      )
      .sort((a: any, b: any) => matchRank(b) - matchRank(a))
      .slice(0, 4)
      .map((match: any) => ({
        ...match,
        standardSearchTopic: item.topic,
        standardSearchQuery: item.query,
      }));
  };

  const languageMatches = await queryWithFilter({ language: sourceLanguage });
  if (languageMatches.length) return languageMatches;

  // Legacy/raw standards vectors may not have reliable language metadata. Falling
  // back to an unfiltered search is safe because final claims still require an
  // exact standard match, an exact clause present in the raw excerpt and a
  // verbatim evidence quote from that same raw excerpt.
  return queryWithFilter();`;

const newBlock = `  const exactClauseQuery = /\\b\\d+(?:\\.\\d+){2,6}\\b/.test(item.query);
  const minimumScore = exactClauseQuery ? 0.12 : MIN_STANDARD_SCORE;

  const queryWithFilter = async (filter?: Record<string, string>) => {
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
  };

  // Prefer raw vectors explicitly classified as standards so unrelated manuals do
  // not consume the nearest-neighbour window. Document-map nodes only guide the
  // query plan and can never become normative evidence.
  const standardMatches = await queryWithFilter({ contentType: "standard" });
  if (standardMatches.length) return standardMatches;

  const languageMatches = await queryWithFilter({ language: sourceLanguage });
  if (languageMatches.length) return languageMatches;

  // Legacy/raw standards vectors may not have reliable enrichment metadata.
  // Falling back to an unfiltered search is safe because final claims still
  // require exact standard membership, an exact clause in the raw excerpt and a
  // verbatim evidence quote from that same raw excerpt.
  return queryWithFilter();`;

if (source.includes(newBlock)) {
  console.log("Standards retrieval patch already applied.");
  process.exit(0);
}
if (!source.includes(oldBlock)) {
  throw new Error("Expected rawMatchesForQuery block not found");
}

await writeFile(path, source.replace(oldBlock, newBlock), "utf8");
console.log("Applied document-map guided raw evidence retrieval patch.");
