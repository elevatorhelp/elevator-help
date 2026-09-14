import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, patches) {
  let source = await readFile(path, "utf8");
  for (const { marker, anchor, replacement } of patches) {
    if (source.includes(marker)) continue;
    if (!source.includes(anchor)) throw new Error(`${path}: anchor not found for ${marker}`);
    source = source.replace(anchor, replacement);
  }
  await writeFile(path, source, "utf8");
}

await patchFile("scripts/drive-ingest.mjs", [
  {
    marker: "mapVersion: DOCUMENT_MAP_VERSION,",
    anchor: "  const document = {\n    sourceFileId: file.id,",
    replacement: "  const document = {\n    sourceFileId: file.id,\n    mapVersion: DOCUMENT_MAP_VERSION,",
  },
]);

await patchFile("app/api/document-map-ingest/route.ts", [
  {
    marker: "  mapVersion?: number;",
    anchor: "  sourcePath: string;\n  modifiedTime?: string;",
    replacement: "  sourcePath: string;\n  mapVersion?: number;\n  modifiedTime?: string;",
  },
  {
    marker: "const mapVersion = Number.isInteger(document.mapVersion)",
    anchor: "    if (!pages.length || pages.length > MAX_PAGES) {",
    replacement:
      "    const mapVersion = Number.isInteger(document.mapVersion) && Number(document.mapVersion) > 0\n" +
      "      ? Number(document.mapVersion)\n" +
      "      : 1;\n\n" +
      "    if (!pages.length || pages.length > MAX_PAGES) {",
  },
  {
    marker: "          String(mapVersion),",
    anchor: "          document.sourceFileId,\n          document.modifiedTime || \"\",",
    replacement: "          document.sourceFileId,\n          String(mapVersion),\n          document.modifiedTime || \"\",",
  },
  {
    marker: "          mapVersion,\n          mapNodeType:",
    anchor: "          contentType: \"document-map\",\n          mapNodeType: node.nodeType,",
    replacement: "          contentType: \"document-map\",\n          mapVersion,\n          mapNodeType: node.nodeType,",
  },
  {
    marker: "      mapVersion,\n      upserted:",
    anchor: "      ok: true,\n      upserted: vectors.length,",
    replacement: "      ok: true,\n      mapVersion,\n      upserted: vectors.length,",
  },
]);

await patchFile("app/lib/standards-engine.ts", [
  {
    marker: "const ACTIVE_DOCUMENT_MAP_VERSION = 3;",
    anchor: "const MIN_STANDARD_SCORE = 0.20;",
    replacement: "const MIN_STANDARD_SCORE = 0.20;\nconst ACTIVE_DOCUMENT_MAP_VERSION = 3;",
  },
  {
    marker: "metadata.mapVersion && Number(metadata.mapVersion) !== ACTIVE_DOCUMENT_MAP_VERSION",
    anchor: "  if (metadata.contentType !== \"document-map\") return null;\n  if (!matchBelongsToStandard(match, standard.compact)) return null;",
    replacement:
      "  if (metadata.contentType !== \"document-map\") return null;\n" +
      "  // New map nodes are schema-versioned. Keep legacy unversioned nodes readable\n" +
      "  // during backfill, but never let an explicitly stale schema guide retrieval.\n" +
      "  if (metadata.mapVersion && Number(metadata.mapVersion) !== ACTIVE_DOCUMENT_MAP_VERSION) return null;\n" +
      "  if (!matchBelongsToStandard(match, standard.compact)) return null;",
  },
]);

console.log("Patched document-map nodes with schema version metadata and retrieval guard.");
