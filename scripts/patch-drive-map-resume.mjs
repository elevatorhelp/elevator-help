import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/drive-ingest.mjs";
let source = await readFile(path, "utf8");

function replaceOnce(oldText, newText, label) {
  if (!source.includes(oldText)) throw new Error(`Patch target not found: ${label}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
`      const oldIds = [
        ...(Array.isArray(old.ids) ? old.ids : []),
        ...(Array.isArray(old.mapIds) ? old.mapIds : []),
      ];`,
`      const oldIds = Array.from(
        new Set([
          ...(Array.isArray(old.ids) ? old.ids : []),
          ...(Array.isArray(old.mapIds) ? old.mapIds : []),
          ...(Array.isArray(old.partialMapIds) ? old.partialMapIds : []),
        ])
      );`,
  "deleted file cleanup includes partial map vectors"
);

replaceOnce(
`      const mapStartPage = canResumeMap ? previous.mapNextPage : 1;
      const initialMapIds = canResumeMap ? previous.partialMapIds : [];

      const indexedMap = await processPdf(file, accessToken, ingestToken, {`,
`      const mapStartPage = canResumeMap ? previous.mapNextPage : 1;
      const initialMapIds = canResumeMap ? previous.partialMapIds : [];

      // A partial map belongs to the exact source fingerprint that created it.
      // If the Drive file changed (or the map schema/version changed), those
      // interrupted nodes must not survive while a fresh map is being built.
      if (!canResumeMap && Array.isArray(previous.partialMapIds) && previous.partialMapIds.length) {
        console.log(
          \`Removing \${previous.partialMapIds.length} stale partial map vectors for \${file.name}\`
        );
        await deleteIds(previous.partialMapIds, ingestToken);
        delete next.partialMapIds;
        delete next.partialMapVersion;
        delete next.partialMapFingerprint;
        delete next.mapNextPage;
        delete next.mapProgressAt;
        scope.files[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
      }

      const indexedMap = await processPdf(file, accessToken, ingestToken, {`,
  "discard partial map from stale fingerprint before fresh map"
);

replaceOnce(
`      const staleMapIds = (Array.isArray(previous.mapIds) ? previous.mapIds : []).filter(
        (id) => !newMapIdSet.has(id)
      );`,
`      const staleMapIds = Array.from(
        new Set([
          ...(Array.isArray(previous.mapIds) ? previous.mapIds : []),
          ...(Array.isArray(previous.partialMapIds) ? previous.partialMapIds : []),
        ])
      ).filter((id) => !newMapIdSet.has(id));`,
  "completed map cleanup includes interrupted map vectors"
);

await writeFile(path, source, "utf8");
console.log("Applied stale partial document-map vector cleanup.");
