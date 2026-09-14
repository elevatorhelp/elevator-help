import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/drive-ingest.mjs";
let source = await readFile(path, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`Patch target not found: ${label}`);
  }
  source = source.replace(oldText, newText);
}

replaceOnce(
  "const DOCUMENT_MAP_VERSION = 2;\nconst RAW_EMBEDDING_VERSION = 2;",
  "const DOCUMENT_MAP_VERSION = 3;\nconst RAW_EMBEDDING_VERSION = 2;",
  "document-map repair version"
);

replaceOnce(
  "async function processPdf(file, accessToken, ingestToken) {",
  "async function processPdf(\n  file,\n  accessToken,\n  ingestToken,\n  { ingestRaw = true, ingestMap = true } = {}\n) {",
  "processPdf options"
);

replaceOnce(
`  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const result = await callIngest({ action: "upsert", chunks: batch }, ingestToken);
    if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
      throw new Error(
        \`Ingestion endpoint raw embedding version mismatch: expected \${RAW_EMBEDDING_VERSION}, got \${String(result?.rawEmbeddingVersion ?? "missing")}\`
      );
    }
    console.log(\`Upserted \${result.upserted} chunks (\${Math.min(i + BATCH_SIZE, chunks.length)}/\${chunks.length})\`);
  }

  const mapIds = await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint);
  console.log(\`Created \${mapIds.length} document knowledge-map nodes\`);

  return {
    ids: chunks.map((chunk) => chunk.id),
    mapIds,
  };`,
`  if (ingestRaw) {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const result = await callIngest({ action: "upsert", chunks: batch }, ingestToken);
      if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
        throw new Error(
          \`Ingestion endpoint raw embedding version mismatch: expected \${RAW_EMBEDDING_VERSION}, got \${String(result?.rawEmbeddingVersion ?? "missing")}\`
        );
      }
      console.log(\`Upserted \${result.upserted} chunks (\${Math.min(i + BATCH_SIZE, chunks.length)}/\${chunks.length})\`);
    }
  }

  const mapIds = ingestMap
    ? await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint)
    : null;
  if (ingestMap) {
    console.log(\`Created \${mapIds.length} document knowledge-map nodes\`);
  }

  return {
    ids: ingestRaw ? chunks.map((chunk) => chunk.id) : null,
    mapIds,
  };`,
  "layer-selective processing"
);

replaceOnce(
`  const changed = prioritizeChangedFiles(files.filter((file) => {
    const previous = scope.files[file.id];
    return (
      previous?.fingerprint !== fingerprint(file) ||
      previous?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION ||
      previous?.mapVersion !== DOCUMENT_MAP_VERSION ||
      !Array.isArray(previous?.mapIds)
    );
  }));`,
`  const changed = prioritizeChangedFiles(files.filter((file) => {
    const previous = scope.files[file.id];
    const currentFingerprint = fingerprint(file);
    const rawFingerprint = previous?.rawFingerprint ?? previous?.fingerprint;
    const mapFingerprint = previous?.mapFingerprint ?? previous?.fingerprint;
    return (
      rawFingerprint !== currentFingerprint ||
      previous?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION ||
      !Array.isArray(previous?.ids) ||
      mapFingerprint !== currentFingerprint ||
      previous?.mapVersion !== DOCUMENT_MAP_VERSION ||
      !Array.isArray(previous?.mapIds)
    );
  }));`,
  "layer-aware changed detection"
);

const oldLoop = `  for (const file of selected) {
    const previous = scope.files[file.id];
    const previousIds = [
      ...(Array.isArray(previous?.ids) ? previous.ids : []),
      ...(Array.isArray(previous?.mapIds) ? previous.mapIds : []),
    ];

    if (previousIds.length) {
      console.log(\`Deleting \${previousIds.length} old vectors for changed file \${file.name}\`);
      await deleteIds(previousIds, ingestToken);
    }

    const indexed = await processPdf(file, accessToken, ingestToken);
    scope.files[file.id] = {
      name: file.name,
      sourcePath: file.sourcePath,
      fingerprint: fingerprint(file),
      modifiedTime: file.modifiedTime || null,
      ids: indexed.ids,
      mapIds: indexed.mapIds,
      rawEmbeddingVersion: RAW_EMBEDDING_VERSION,
      mapVersion: DOCUMENT_MAP_VERSION,
      indexedAt: new Date().toISOString(),
    };
    state.scopes[DRIVE_FOLDER_ID] = scope;
    await saveState(state);
  }`;

const newLoop = `  for (const file of selected) {
    const previous = scope.files[file.id] || {};
    const currentFingerprint = fingerprint(file);
    const previousRawFingerprint = previous.rawFingerprint ?? previous.fingerprint;
    const previousMapFingerprint = previous.mapFingerprint ?? previous.fingerprint;
    const needsRaw =
      previousRawFingerprint !== currentFingerprint ||
      previous.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION ||
      !Array.isArray(previous.ids);
    const needsMap =
      previousMapFingerprint !== currentFingerprint ||
      previous.mapVersion !== DOCUMENT_MAP_VERSION ||
      !Array.isArray(previous.mapIds);

    const next = {
      ...previous,
      name: file.name,
      sourcePath: file.sourcePath,
      modifiedTime: file.modifiedTime || null,
    };

    if (needsRaw) {
      console.log(\`Raw-vector backfill required for \${file.name}\`);
      const indexedRaw = await processPdf(file, accessToken, ingestToken, {
        ingestRaw: true,
        ingestMap: false,
      });
      const newIds = Array.isArray(indexedRaw.ids) ? indexedRaw.ids : [];
      const newIdSet = new Set(newIds);
      const staleRawIds = (Array.isArray(previous.ids) ? previous.ids : []).filter(
        (id) => !newIdSet.has(id)
      );
      if (staleRawIds.length) await deleteIds(staleRawIds, ingestToken);

      next.ids = newIds;
      next.rawEmbeddingVersion = RAW_EMBEDDING_VERSION;
      next.rawFingerprint = currentFingerprint;
      next.rawIndexedAt = new Date().toISOString();
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(\`Raw-vector checkpoint saved for \${file.name}\`);
    }

    if (needsMap) {
      console.log(\`Document-map backfill required for \${file.name}\`);
      const indexedMap = await processPdf(file, accessToken, ingestToken, {
        ingestRaw: false,
        ingestMap: true,
      });
      const newMapIds = Array.isArray(indexedMap.mapIds) ? indexedMap.mapIds : [];
      const newMapIdSet = new Set(newMapIds);
      const staleMapIds = (Array.isArray(previous.mapIds) ? previous.mapIds : []).filter(
        (id) => !newMapIdSet.has(id)
      );
      if (staleMapIds.length) await deleteIds(staleMapIds, ingestToken);

      next.mapIds = newMapIds;
      next.mapVersion = DOCUMENT_MAP_VERSION;
      next.mapFingerprint = currentFingerprint;
      next.mapIndexedAt = new Date().toISOString();
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(\`Document-map checkpoint saved for \${file.name}\`);
    }

    if (next.rawFingerprint === currentFingerprint && next.mapFingerprint === currentFingerprint) {
      next.fingerprint = currentFingerprint;
      next.indexedAt = new Date().toISOString();
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
    }
  }`;

replaceOnce(oldLoop, newLoop, "resumable layer checkpoints");

await writeFile(path, source, "utf8");
console.log("Applied resumable raw/document-map ingestion checkpoints.");
