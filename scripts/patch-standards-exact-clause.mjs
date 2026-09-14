import { readFile, writeFile } from "node:fs/promises";

const path = "app/lib/standards-engine.ts";
let source = await readFile(path, "utf8");

if (!source.includes("EXACT_CLAUSE_VECTOR_CANDIDATES")) {
  const anchor = "async function rawMatchesForQuery(\n";
  if (!source.includes(anchor)) throw new Error("rawMatchesForQuery anchor not found");

  const helper = [
    'const EXACT_CLAUSE_VECTOR_CANDIDATES: Record<string, string[]> = {',
    '  // Hashed Vectorize IDs only; source documents remain private/backend-only.',
    '  // Candidate IDs cover every possible chunk on the indexed page so retrieval',
    '  // can verify the exact clause from raw metadata without generating an embedding.',
    '  "EN 81-20|5.2.1.8.2": [',
    '    "drv-70fa7253f3318a22377678eb3f705954e7c48aa6",',
    '    "drv-925660a2df2b9188d9e8104a3068ffbaf0240114",',
    '    "drv-773d7df49298e37d7b24541704320d05574836da",',
    '    "drv-2de86564b889def0585a51c5653f077389e69176",',
    '    "drv-38dbf867c7d9c108c8233f24ab6546bb850f5eb4",',
    '    "drv-54ec1b004590a5c90fc05a0c59ca20b1516f200c",',
    '  ],',
    '  "EN 81-20|5.2.5.3.1": [',
    '    "drv-1711405c83668ca85b5897b4e789e9ed22c94737",',
    '    "drv-aa84e95bcf5a855c7faed56b8844fa95d8100942",',
    '    "drv-706323e7e0c67f0ab1a7152c3eedb66cdf72dfe6",',
    '    "drv-d73c7eed34f2294bd1e353e9a38dea838ef488f1",',
    '    "drv-02dbfe89dedf5fd302e7343b203a6085356a92b2",',
    '    "drv-70a511353fd594a0351d63814fb3bbd233fbd5fb",',
    '  ],',
    '  "EN 81-20|5.3.4.1": [',
    '    "drv-d34ec1f027752381729f91cefcee003281735f59",',
    '    "drv-8eb33e756437a8db8feb98c237cd6c74395a3329",',
    '    "drv-5e620557e8a4096e753456260f90bcdf4e7a8740",',
    '    "drv-d68f9ec2edeb66960b2afc4159fe5d3cfe38c1eb",',
    '    "drv-ad65861df3fe10eb7954958211948ffdd5ee4e16",',
    '    "drv-6c42248faadc9d10707d4c73527a7ff976bb7074",',
    '  ],',
    '};',
    '',
    'function clauseTokensFromQuery(query: string) {',
    '  return Array.from(new Set(query.match(/\\b\\d+(?:\\.\\d+){2,6}\\b/g) || []));',
    '}',
    '',
    'function textContainsExactClause(text: string, clause: string) {',
    '  const escaped = clause.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");',
    '  return new RegExp(`(?:^|[^0-9.])${escaped}(?:[^0-9.]|$)`).test(text);',
    '}',
    '',
    'async function exactClauseMatchesForQuery(',
    '  item: PlannedQuery,',
    '  standard: (typeof CORE_STANDARDS)[number],',
    '  vectorize: any',
    ') {',
    '  const clauses = clauseTokensFromQuery(item.query);',
    '  if (!clauses.length || typeof vectorize?.getByIds !== "function") return [];',
    '',
    '  const ids = Array.from(',
    '    new Set(',
    '      clauses.flatMap(',
    '        (clause) => EXACT_CLAUSE_VECTOR_CANDIDATES[`${standard.code}|${clause}`] || []',
    '      )',
    '    )',
    '  );',
    '  if (!ids.length) return [];',
    '',
    '  try {',
    '    const result = await vectorize.getByIds(ids);',
    '    const vectors = Array.isArray(result)',
    '      ? result',
    '      : Array.isArray((result as any)?.vectors)',
    '        ? (result as any).vectors',
    '        : [];',
    '',
    '    return vectors',
    '      .filter((match: any) => {',
    '        const text = String(match?.metadata?.text || "");',
    '        return (',
    '          text.length > 0 &&',
    '          match?.metadata?.contentType !== "document-map" &&',
    '          matchBelongsToStandard(match, standard.compact) &&',
    '          clauses.some((clause) => textContainsExactClause(text, clause))',
    '        );',
    '      })',
    '      .map((match: any) => ({',
    '        ...match,',
    '        score: Math.max(Number(match?.score || 0), 1),',
    '        standardSearchTopic: item.topic,',
    '        standardSearchQuery: item.query,',
    '      }))',
    '      .sort((a: any, b: any) => matchRank(b) - matchRank(a));',
    '  } catch (error) {',
    '    console.error("Exact standards clause lookup failed", {',
    '      standard: standard.code,',
    '      clauses,',
    '      message: error instanceof Error ? error.message : String(error),',
    '    });',
    '    return [];',
    '  }',
    '}',
    '',
  ].join("\n");

  // Use a replacement callback so "$&" inside the generated regex remains literal.
  source = source.replace(anchor, () => `${helper}${anchor}`);
}

if (!source.includes("const exactClauseMatches = await exactClauseMatchesForQuery")) {
  const old = ') {\n  const retrievalQuery = `${item.query}\\n${standard.code}`;';
  const replacement = [
    ') {',
    '  // Exact clause locators bypass embedding generation entirely. This keeps',
    '  // verified standards answers working even when an embedding provider is',
    '  // temporarily quota-limited.',
    '  const exactClauseMatches = await exactClauseMatchesForQuery(item, standard, vectorize);',
    '  if (exactClauseMatches.length) return exactClauseMatches;',
    '',
    '  const retrievalQuery = `${item.query}\\n${standard.code}`;',
  ].join("\n");
  if (!source.includes(old)) throw new Error("rawMatchesForQuery body anchor not found");
  source = source.replace(old, () => replacement);
}

if (!source.includes("Standards query item failed; continuing")) {
  const old = `    for (const item of plan) {\n      const valid = await rawMatchesForQuery(item, standard, sourceLanguage, ai, vectorize);\n\n      const current = perTopic.get(item.topic) || [];`;
  const replacement = `    for (const item of plan) {\n      let valid: any[] = [];\n      try {\n        valid = await rawMatchesForQuery(item, standard, sourceLanguage, ai, vectorize);\n      } catch (error) {\n        console.error("Standards query item failed; continuing", {\n          standard: standard.code,\n          query: item.query,\n          message: error instanceof Error ? error.message : String(error),\n        });\n      }\n\n      const current = perTopic.get(item.topic) || [];`;
  if (!source.includes(old)) throw new Error("queryOneStandard loop anchor not found");
  source = source.replace(old, () => replacement);
}

if (!source.includes("distinguish each physical interface")) {
  const anchor = "- If one standard has no relevant evidence, do not force it into the answer.\n";
  if (!source.includes(anchor)) throw new Error("claim prompt anchor not found");
  source = source.replace(
    anchor,
    () => `${anchor}- For distance/clearance questions, distinguish each physical interface; do not merge car-to-wall, sill-to-sill, door-edge or car-roof clearances into one requirement.\n`
  );
}

if (!source.includes("verified facts only establish maximum permissible distances")) {
  const anchor = "- Do not add requirements, numbers, exceptions or interpretations that are not already in the verified facts.\n";
  if (!source.includes(anchor)) throw new Error("summary prompt anchor not found");
  source = source.replace(
    anchor,
    () => `${anchor}- If the user asks for a minimum but the verified facts only establish maximum permissible distances, explicitly say that the verified provisions are maximum limits, not minimum values. Do not claim that no minimum exists elsewhere unless the verified facts establish that.\n`
  );
}

await writeFile(path, source, "utf8");
console.log("Patched standards engine with exact-clause retrieval and clearance answer safeguards.");
