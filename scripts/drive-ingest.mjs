import { createHash, createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || "1GAuMp6D99K9kqLkUMJZM-iHoIS319Loo";
const MAX_FILES = Number(process.env.MAX_FILES || "1");
const INGEST_ENDPOINT = process.env.INGEST_ENDPOINT || "https://elevator.help/api/drive-ingest-batch";
const DOCUMENT_MAP_ENDPOINT =
  process.env.DOCUMENT_MAP_ENDPOINT || "https://elevator.help/api/document-map-ingest";
const STATE_PATH = process.env.STATE_PATH || ".ingestion-state/drive.json";
const BATCH_SIZE = 8;
const CHUNK_SIZE = 2200;
const CHUNK_OVERLAP = 250;
const MIN_CHUNK_LENGTH = 80;
const MAP_PAGES_PER_BATCH = 6;
const MAX_MAP_PAGE_TEXT = 7000;
const DOCUMENT_MAP_VERSION = 3;
const RAW_EMBEDDING_VERSION = 2;

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: serviceAccount.token_uri,
      exp: now + 3600,
      iat: now,
    })
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const response = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) throw new Error(`Google token error: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

async function driveJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Drive API error: ${await response.text()}`);
  return response.json();
}

async function listFolder(folderId, accessToken, pathPrefix = "") {
  const entries = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum)",
      pageSize: "1000",
      orderBy: "name",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await driveJson(`https://www.googleapis.com/drive/v3/files?${params}`, accessToken);

    for (const file of data.files || []) {
      const currentPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
      if (file.mimeType === "application/vnd.google-apps.folder") {
        entries.push(...(await listFolder(file.id, accessToken, currentPath)));
      } else if (file.mimeType === "application/pdf") {
        entries.push({ ...file, sourcePath: currentPath });
      }
    }

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return entries;
}

async function downloadPdf(fileId, accessToken) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`PDF download error: ${await response.text()}`);
  return new Uint8Array(await response.arrayBuffer());
}

function detectLanguageHint(fileName) {
  const lower = fileName.toLowerCase();
  if (/(?:^|[_\-.])de[_\-.]?en(?:[_\-.]|$)/.test(lower) || /(?:^|[_\-.])en[_\-.]?de(?:[_\-.]|$)/.test(lower)) {
    return "de-en";
  }
  if (/(?:^|[_\-.])de(?:[_\-.]|$)/.test(lower)) return "de";
  if (/(?:^|[_\-.])en(?:[_\-.]|$)/.test(lower)) return "en";
  return null;
}

function documentGroupHint(fileName) {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/(?:^|[_\-.])(de[_\-.]?en|en[_\-.]?de|de|en)(?:[_\-.]|$)/gi, "-")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 120) || null;
}

function coreStandardPriority(file) {
  const compact = `${file?.name || ""} ${file?.sourcePath || ""}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (compact.includes("EN8120")) return 0;
  if (compact.includes("EN8150")) return 1;
  return 2;
}

function prioritizeChangedFiles(files) {
  return [...files].sort((a, b) => {
    const priorityDelta = coreStandardPriority(a) - coreStandardPriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    return String(a.sourcePath || a.name || "").localeCompare(
      String(b.sourcePath || b.name || ""),
      "en"
    );
  });
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text) {
  const normalized = normalizeText(text);
  if (normalized.length < MIN_CHUNK_LENGTH) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    if (end < normalized.length) {
      const nearbyBreak = Math.max(
        normalized.lastIndexOf("\n", end),
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf(" ", end)
      );
      if (nearbyBreak > start + Math.floor(CHUNK_SIZE * 0.65)) end = nearbyBreak + 1;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_LENGTH) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
}

function vectorId(fileId, page, chunkIndex) {
  const digest = createHash("sha256")
    .update(`${fileId}:${page}:${chunkIndex}`)
    .digest("hex")
    .slice(0, 40);
  return `drv-${digest}`;
}

function fingerprint(file) {
  return file.md5Checksum || `${file.modifiedTime || ""}:${file.size || ""}`;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return { version: 2, scopes: {} };
  }
}

async function saveState(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function callJsonEndpoint(endpoint, payload, token, label) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(`${label} error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function callIngest(payload, token) {
  return callJsonEndpoint(INGEST_ENDPOINT, payload, token, "Ingestion endpoint");
}

async function callDocumentMap(payload, token) {
  return callJsonEndpoint(DOCUMENT_MAP_ENDPOINT, payload, token, "Document-map endpoint");
}

async function deleteIds(ids, token) {
  for (let i = 0; i < ids.length; i += 100) {
    await callIngest({ action: "delete", ids: ids.slice(i, i + 100) }, token);
  }
}

async function buildDocumentMap(
  file,
  pages,
  ingestToken,
  languageHint,
  groupHint,
  { startPage = 1, initialIds = [], onProgress = null } = {}
) {
  const pageInputs = pages
    .map((pageText, index) => ({
      page: index + 1,
      text: normalizeText(pageText).slice(0, MAX_MAP_PAGE_TEXT),
    }))
    .filter((page) => page.text.length >= MIN_CHUNK_LENGTH);

  if (!pageInputs.length) return [];

  const mapIds = Array.isArray(initialIds) ? [...initialIds] : [];
  const document = {
    sourceFileId: file.id,
    mapVersion: DOCUMENT_MAP_VERSION,
    fileName: file.name,
    sourcePath: file.sourcePath,
    modifiedTime: file.modifiedTime || undefined,
    languageHint,
    documentGroupHint: groupHint,
  };

  const firstIndex = pageInputs.findIndex((page) => page.page >= Math.max(1, startPage));
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
      `Mapped pages ${window[0].page}-${window[window.length - 1].page}: ${ids.length} knowledge nodes`
    );
  }

  return mapIds;
}

async function processPdf(
  file,
  accessToken,
  ingestToken,
  {
    ingestRaw = true,
    ingestMap = true,
    mapStartPage = 1,
    initialMapIds = [],
    onMapProgress = null,
  } = {}
) {
  console.log(`Downloading ${file.sourcePath}`);
  const bytes = await downloadPdf(file.id, accessToken);
  const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const chunks = [];
  const languageHint = detectLanguageHint(file.name);
  const groupHint = documentGroupHint(file.name);

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageChunks = splitIntoChunks(pages[pageIndex]);
    for (let chunkIndex = 0; chunkIndex < pageChunks.length; chunkIndex++) {
      chunks.push({
        id: vectorId(file.id, pageIndex + 1, chunkIndex),
        text: pageChunks[chunkIndex],
        sourceFileId: file.id,
        fileName: file.name,
        sourcePath: file.sourcePath,
        page: pageIndex + 1,
        chunkIndex,
        modifiedTime: file.modifiedTime || undefined,
        languageHint,
        documentGroupHint: groupHint,
      });
    }
  }

  console.log(`Extracted ${chunks.length} chunks from ${totalPages} pages`);

  if (ingestRaw) {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const result = await callIngest({ action: "upsert", chunks: batch }, ingestToken);
      if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
        throw new Error(
          `Ingestion endpoint raw embedding version mismatch: expected ${RAW_EMBEDDING_VERSION}, got ${String(result?.rawEmbeddingVersion ?? "missing")}`
        );
      }
      console.log(`Upserted ${result.upserted} chunks (${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length})`);
    }
  }

  const mapIds = ingestMap
    ? await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint, {
        startPage: mapStartPage,
        initialIds: initialMapIds,
        onProgress: onMapProgress,
      })
    : null;
  if (ingestMap) {
    console.log(`Created ${mapIds.length} document knowledge-map nodes`);
  }

  return {
    ids: ingestRaw ? chunks.map((chunk) => chunk.id) : null,
    mapIds,
  };
}

async function main() {
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const ingestToken = process.env.ELEVATOR_INGESTION_TOKEN;

  if (!serviceAccountRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");
  if (!ingestToken) throw new Error("ELEVATOR_INGESTION_TOKEN is missing");

  const serviceAccount = JSON.parse(serviceAccountRaw);
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const files = await listFolder(DRIVE_FOLDER_ID, accessToken);
  const state = await loadState();
  state.version = 2;
  state.scopes ||= {};
  const scope = state.scopes[DRIVE_FOLDER_ID] || { files: {} };
  scope.files ||= {};

  console.log(`Found ${files.length} PDF files in Drive scope ${DRIVE_FOLDER_ID}`);

  const foundIds = new Set(files.map((file) => file.id));
  for (const [fileId, old] of Object.entries(scope.files)) {
    if (!foundIds.has(fileId)) {
      const oldIds = Array.from(
        new Set([
          ...(Array.isArray(old.ids) ? old.ids : []),
          ...(Array.isArray(old.mapIds) ? old.mapIds : []),
          ...(Array.isArray(old.partialMapIds) ? old.partialMapIds : []),
        ])
      );
      if (oldIds.length) {
        console.log(`Removing ${oldIds.length} vectors for deleted Drive file ${fileId}`);
        await deleteIds(oldIds, ingestToken);
      }
      delete scope.files[fileId];
    }
  }

  const changed = prioritizeChangedFiles(files.filter((file) => {
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
  }));
  console.log(
    `${changed.length} PDF files are new, changed, or need raw/document-map backfill`
  );

  const selected = changed.slice(0, Math.max(0, MAX_FILES));

  for (const file of selected) {
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
      console.log(`Raw-vector backfill required for ${file.name}`);
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
      console.log(`Raw-vector checkpoint saved for ${file.name}`);
    }

    if (needsMap) {
      console.log(`Document-map backfill required for ${file.name}`);
      const canResumeMap =
        previous.partialMapVersion === DOCUMENT_MAP_VERSION &&
        previous.partialMapFingerprint === currentFingerprint &&
        Array.isArray(previous.partialMapIds) &&
        Number.isInteger(previous.mapNextPage) &&
        previous.mapNextPage > 1;
      const mapStartPage = canResumeMap ? previous.mapNextPage : 1;
      const initialMapIds = canResumeMap ? previous.partialMapIds : [];

      // A partial map belongs to the exact source fingerprint that created it.
      // If the Drive file changed (or the map schema/version changed), those
      // interrupted nodes must not survive while a fresh map is being built.
      if (!canResumeMap && Array.isArray(previous.partialMapIds) && previous.partialMapIds.length) {
        console.log(
          `Removing ${previous.partialMapIds.length} stale partial map vectors for ${file.name}`
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
          console.log(`Document-map progress checkpoint: next page ${nextPage}`);
        },
      });
      const newMapIds = Array.isArray(indexedMap.mapIds) ? indexedMap.mapIds : [];
      const newMapIdSet = new Set(newMapIds);
      const staleMapIds = Array.from(
        new Set([
          ...(Array.isArray(previous.mapIds) ? previous.mapIds : []),
          ...(Array.isArray(previous.partialMapIds) ? previous.partialMapIds : []),
        ])
      ).filter((id) => !newMapIdSet.has(id));
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
      console.log(`Document-map checkpoint saved for ${file.name}`);
    }

    if (next.rawFingerprint === currentFingerprint && next.mapFingerprint === currentFingerprint) {
      next.fingerprint = currentFingerprint;
      next.indexedAt = new Date().toISOString();
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
    }
  }

  state.scopes[DRIVE_FOLDER_ID] = scope;
  await saveState(state);

  console.log(`Done. Processed ${selected.length} file(s); ${Math.max(0, changed.length - selected.length)} changed file(s) remain.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
