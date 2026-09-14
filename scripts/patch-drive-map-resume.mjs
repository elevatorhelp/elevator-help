import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/drive-ingest.mjs";
let source = await readFile(path, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Patch target not found: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
`async function buildDocumentMap(file, pages, ingestToken, languageHint, groupHint) {`,
`async function buildDocumentMap(
  file,
  pages,
  ingestToken,
  languageHint,
  groupHint,
  { startPage = 1, initialIds = [], onProgress = null } = {}
) {`,
  "buildDocumentMap signature"
);

replaceOnce(
`  const mapIds = [];
  const document = {`,
`  const mapIds = Array.isArray(initialIds) ? [...initialIds] : [];
  const document = {`,
  "initial map ids"
);

replaceOnce(
`  for (let i = 0; i < pageInputs.length; i += MAP_PAGES_PER_BATCH) {
    const window = pageInputs.slice(i, i + MAP_PAGES_PER_BATCH);
    const result = await callDocumentMap({ document, pages: window }, ingestToken);
    const ids = Array.isArray(result?.ids) ? result.ids : [];
    mapIds.push(...ids);
    console.log(
      \`Mapped pages \${window[0].page}-\${window[window.length - 1].page}: \${ids.length} knowledge nodes\`
    );
  }`,
`  const firstIndex = pageInputs.findIndex((page) => page.page >= Math.max(1, startPage));
  if (firstIndex === -1) return mapIds;

  for (let i = firstIndex; i < pageInputs.length; i += MAP_PAGES_PER_BATCH) {
    const window = pageInputs.slice(i, i + MAP_PAGES_PER_BATCH);
    const result = await callDocumentMap({ document, pages: window }, ingestToken);
    const ids = Array.isArray(result?.ids) ? result.ids : [];
    mapIds.push(...ids);
    const nextPage = window[window.length - 1].page + 1;
    if (typeof onProgress === "function") {
      await onProgress({ ids: [...mapIds], nextPage });
    }
    console.log(
      \`Mapped pages \${window[0].page}-\${window[window.length - 1].page}: \${ids.length} knowledge nodes\`
    );
  }`,
  "document-map per-window progress"
);

replaceOnce(
`  { ingestRaw = true, ingestMap = true } = {}
) {`,
`  {
    ingestRaw = true,
    ingestMap = true,
    mapStartPage = 1,
    initialMapIds = [],
    onMapProgress = null,
  } = {}
) {`,
  "processPdf map resume options"
);

replaceOnce(
`  const mapIds = ingestMap
    ? await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint)
    : null;`,
`  const mapIds = ingestMap
    ? await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint, {
        startPage: mapStartPage,
        initialIds: initialMapIds,
        onProgress: onMapProgress,
      })
    : null;`,
  "pass map resume options"
);

replaceOnce(
`    if (needsMap) {
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
    }`,
`    if (needsMap) {
      console.log(\`Document-map backfill required for \${file.name}\`);
      const canResumeMap =
        previous.partialMapVersion === DOCUMENT_MAP_VERSION &&
        previous.partialMapFingerprint === currentFingerprint &&
        Array.isArray(previous.partialMapIds) &&
        Number.isInteger(previous.mapNextPage) &&
        previous.mapNextPage > 1;
      const mapStartPage = canResumeMap ? previous.mapNextPage : 1;
      const initialMapIds = canResumeMap ? previous.partialMapIds : [];

      const indexedMap = await processPdf(file, accessToken, ingestToken, {
        ingestRaw: false,
        ingestMap: true,
        mapStartPage,
        initialMapIds,
        onMapProgress: async ({ ids, nextPage }) => {
          next.partialMapIds = ids;
          next.partialMapVersion = DOCUMENT_MAP_VERSION;
          next.partialMapFingerprint = currentFingerprint;
          next.mapNextPage = nextPage;
          next.mapProgressAt = new Date().toISOString();
          scope.files[file.id] = next;
          state.scopes[DRIVE_FOLDER_ID] = scope;
          await saveState(state);
          console.log(\`Document-map progress checkpoint: next page \${nextPage}\`);
        },
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
      delete next.partialMapIds;
      delete next.partialMapVersion;
      delete next.partialMapFingerprint;
      delete next.mapNextPage;
      delete next.mapProgressAt;
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(\`Document-map checkpoint saved for \${file.name}\`);
    }`,
  "resume map stage"
);

await writeFile(path, source, "utf8");
console.log("Applied per-window document-map resume checkpoints.");
