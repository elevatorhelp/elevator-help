import { createHash, createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractText, getDocumentProxy } from "unpdf";

const execFileAsync = promisify(execFile);
const OFFICE_EXTENSIONS = new Set([
  ".doc", ".docx", ".docm", ".dot", ".dotx", ".dotm", ".rtf",
  ".xls", ".xlsx", ".xlsm", ".xlsb", ".xlt", ".xltx", ".xltm", ".xlam",
  ".ppt", ".pptx", ".pptm", ".pot", ".potx", ".potm", ".pps", ".ppsx", ".ppsm",
]);
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".csv", ".tsv", ".log"]);
const GOOGLE_WORKSPACE_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || "1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
const TARGET_FILE_ID = process.env.TARGET_FILE_ID || "";
const FORCE_REINGEST = process.env.FORCE_REINGEST === "true";
const MAX_FILES = Number(process.env.MAX_FILES || "1");
const INGEST_ENDPOINT = process.env.INGEST_ENDPOINT || "https://elevator.help/api/drive-ingest-batch";
const DOCUMENT_MAP_ENDPOINT =
  process.env.DOCUMENT_MAP_ENDPOINT || "https://elevator.help/api/document-map-ingest";
const STATE_PATH = process.env.STATE_PATH || ".ingestion-state/drive.json";
const BATCH_SIZE = 8;
const CHUNK_SIZE = 2200;
const CHUNK_OVERLAP = 250;
const MIN_CHUNK_LENGTH = 20;
const MAP_PAGES_PER_BATCH = 6;
const MAX_MAP_PAGE_TEXT = 7000;
const DOCUMENT_MAP_VERSION = 4;
const RAW_EMBEDDING_VERSION = 3;
const ARCHIVE_INDEX_VERSION = 2;
const GEMINI_CALLS_PER_RAW_BATCH = 2;
const GEMINI_CALLS_PER_MAP_WINDOW = 3;
const MAX_GEMINI_CALLS = Number(process.env.MAX_GEMINI_CALLS || "30");

function createIngestionCallBudget(limitValue = MAX_GEMINI_CALLS) {
  const limit = Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("MAX_GEMINI_CALLS must be a positive integer");
  }
  let reserved = 0;
  return {
    assertFits(count, label) {
      if (reserved + count > limit) {
        throw new Error(
          `INGESTION_GEMINI_BUDGET_EXCEEDED: ${label} needs ${count} call(s), ${limit - reserved} remain`
        );
      }
    },
    reserve(count, label) {
      this.assertFits(count, label);
      reserved += count;
      console.log(`Gemini ingestion budget: reserved ${reserved}/${limit} calls (${label})`);
    },
    snapshot() {
      return { limit, reserved, remaining: Math.max(0, limit - reserved) };
    },
  };
}

function estimateRawGeminiCalls(chunkCount) {
  return Math.ceil(Math.max(0, Number(chunkCount) || 0) / BATCH_SIZE) * GEMINI_CALLS_PER_RAW_BATCH;
}

const ingestionBudget = createIngestionCallBudget();

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
      } else if (file.mimeType === "application/pdf" || file.mimeType === "text/plain" ||
        TEXT_EXTENSIONS.has(extname(file.name).toLowerCase()) ||
        OFFICE_EXTENSIONS.has(extname(file.name).toLowerCase()) ||
        GOOGLE_WORKSPACE_MIME_TYPES.has(file.mimeType)) {
        entries.push({ ...file, sourcePath: currentPath });
      }
    }

    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return entries;
}

async function downloadDocument(file, accessToken) {
  const googleWorkspace = GOOGLE_WORKSPACE_MIME_TYPES.has(file.mimeType);
  const url = googleWorkspace
    ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application%2Fpdf`
    : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Document download error: ${await response.text()}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function downloadText(fileId, accessToken) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Text download error: ${await response.text()}`);
  return response.text();
}

async function officeToPdf(file, bytes) {
  const directory = await mkdtemp(join(tmpdir(), "elevator-office-"));
  const name = basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
  const input = join(directory, name);
  const output = join(directory, `${name.slice(0, -extname(name).length)}.pdf`);
  try {
    await writeFile(input, bytes);
    await execFileAsync("soffice", [
      "-env:UserInstallation=file://" + join(directory, "profile"),
      "--headless", "--convert-to", "pdf", "--outdir", directory, input,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    .replace(/\.[^.]+$/i, "")
    .replace(/(?:^|[_\-.])(de[_\-.]?en|en[_\-.]?de|de|en)(?:[_\-.]|$)/gi, "-")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 120) || null;
}

function prioritizeChangedFiles(files) {
  return [...files].sort((a, b) => {
    return String(a.sourcePath || a.name || "").localeCompare(
      String(b.sourcePath || b.name || ""),
      "en"
    );
  });
}

function createIngestionPlan(files, records = {}, force = false) {
  const ordered = prioritizeChangedFiles(files);
  const evidence = ordered.filter((file) =>
    needsEvidenceBackfill(records[file.id], fingerprint(file), force)
  );
  if (evidence.length) return { phase: "evidence", files: evidence };

  const raw = ordered.filter((file) =>
    needsRawBackfill(records[file.id], fingerprint(file), force)
  );
  if (raw.length) return { phase: "raw", files: raw };

  const map = ordered.filter((file) =>
    needsMapBackfill(records[file.id], fingerprint(file), force)
  );
  return { phase: "map", files: map };
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
    return { version: 3, scopes: {} };
  }
}

function needsRawBackfill(previous, currentFingerprint, force = false) {
  const rawFingerprint = previous?.rawFingerprint ?? previous?.fingerprint;
  return Boolean(
    force ||
      rawFingerprint !== currentFingerprint ||
      previous?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION ||
      !Array.isArray(previous?.ids)
  );
}

function needsEvidenceBackfill(previous, currentFingerprint, force = false) {
  return Boolean(
    force ||
      previous?.evidenceFingerprint !== currentFingerprint ||
      previous?.archiveIndexVersion !== ARCHIVE_INDEX_VERSION ||
      !Array.isArray(previous?.evidenceIds)
  );
}

function needsMapBackfill(previous, currentFingerprint, force = false) {
  const mapFingerprint = previous?.mapFingerprint ?? previous?.fingerprint;
  return Boolean(
    force ||
      mapFingerprint !== currentFingerprint ||
      previous?.mapVersion !== DOCUMENT_MAP_VERSION ||
      !Array.isArray(previous?.mapIds)
  );
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
  if (payload?.action === "upsert") {
    ingestionBudget.reserve(GEMINI_CALLS_PER_RAW_BATCH, "raw chunk batch");
  }
  return callJsonEndpoint(INGEST_ENDPOINT, payload, token, "Ingestion endpoint");
}

async function callDocumentMap(payload, token) {
  ingestionBudget.reserve(GEMINI_CALLS_PER_MAP_WINDOW, "document-map window");
  return callJsonEndpoint(DOCUMENT_MAP_ENDPOINT, payload, token, "Document-map endpoint");
}

async function deleteIds(ids, token) {
  for (let i = 0; i < ids.length; i += 100) {
    await callIngest({ action: "delete", ids: ids.slice(i, i + 100) }, token);
  }
}

async function processEvidenceIndex(file, accessToken, ingestToken) {
  const languageHint = detectLanguageHint(file.name);
  const groupHint = documentGroupHint(file.name);
  let pages;
  if (file.mimeType === "text/plain" || TEXT_EXTENSIONS.has(extname(file.name).toLowerCase())) {
    pages = [await downloadText(file.id, accessToken)];
  } else {
    console.log(`Downloading ${file.sourcePath}`);
    const original = await downloadDocument(file, accessToken);
    const bytes = file.mimeType === "application/pdf" || GOOGLE_WORKSPACE_MIME_TYPES.has(file.mimeType)
      ? original
      : await officeToPdf(file, original);
    const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
    const extracted = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  }

  const chunks = [];
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
        sourceFingerprint: fingerprint(file),
        languageHint,
        documentGroupHint: groupHint,
      });
    }
  }

  for (let index = 0; index < chunks.length; index += BATCH_SIZE) {
    const batch = chunks.slice(index, index + BATCH_SIZE);
    const result = await callJsonEndpoint(
      INGEST_ENDPOINT,
      { action: "index_evidence", chunks: batch },
      ingestToken,
      "Archive evidence endpoint",
    );
    if (result?.archiveIndexVersion !== ARCHIVE_INDEX_VERSION) {
      throw new Error(
        `Archive index version mismatch: expected ${ARCHIVE_INDEX_VERSION}, got ${String(result?.archiveIndexVersion ?? "missing")}`,
      );
    }
  }
  console.log(`Indexed ${chunks.length} exact-evidence chunks without model-specific routing`);
  return chunks.map((chunk) => chunk.id);
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

  if (!pageInputs.length) return { ids: [], complete: true, nextPage: null };

  const mapIds = Array.isArray(initialIds) ? [...initialIds] : [];
  const document = {
    sourceFileId: file.id,
    mapVersion: DOCUMENT_MAP_VERSION,
    fileName: file.name,
    sourcePath: file.sourcePath,
    modifiedTime: file.modifiedTime || undefined,
    sourceFingerprint: fingerprint(file),
    languageHint,
    documentGroupHint: groupHint,
  };

  const firstIndex = pageInputs.findIndex((page) => page.page >= Math.max(1, startPage));
  if (firstIndex === -1) {
    return { ids: mapIds, complete: true, nextPage: null };
  }

  for (let i = firstIndex; i < pageInputs.length; i += MAP_PAGES_PER_BATCH) {
    if (ingestionBudget.snapshot().remaining < GEMINI_CALLS_PER_MAP_WINDOW) {
      console.log(
        `Document-map budget checkpoint reached before page ${pageInputs[i].page}`
      );
      return {
        ids: mapIds,
        complete: false,
        nextPage: pageInputs[i].page,
      };
    }
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

  return { ids: mapIds, complete: true, nextPage: null };
}

async function processPdf(
  file,
  accessToken,
  ingestToken,
  {
    ingestRaw = true,
    ingestMap = true,
    rawStartChunk = 0,
    initialRawIds = [],
    onRawProgress = null,
    mapStartPage = 1,
    initialMapIds = [],
    onMapProgress = null,
  } = {}
) {
  console.log(`Downloading ${file.sourcePath}`);
  const original = await downloadDocument(file, accessToken);
  const bytes = file.mimeType === "application/pdf" || GOOGLE_WORKSPACE_MIME_TYPES.has(file.mimeType)
    ? original
    : await officeToPdf(file, original);
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
        sourceFingerprint: fingerprint(file),
        languageHint,
        documentGroupHint: groupHint,
      });
    }
  }

  console.log(`Extracted ${chunks.length} chunks from ${totalPages} pages`);

  const rawIds = Array.isArray(initialRawIds) ? [...initialRawIds] : [];
  let nextRawChunk = Math.max(0, rawStartChunk);
  if (ingestRaw) {
    for (let i = nextRawChunk; i < chunks.length; i += BATCH_SIZE) {
      if (ingestionBudget.snapshot().remaining < GEMINI_CALLS_PER_RAW_BATCH) {
        console.log(`Raw-vector budget checkpoint reached at chunk ${i}/${chunks.length}`);
        break;
      }
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const result = await callIngest({ action: "upsert", chunks: batch }, ingestToken);
      if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
        throw new Error(
          `Ingestion endpoint raw embedding version mismatch: expected ${RAW_EMBEDDING_VERSION}, got ${String(result?.rawEmbeddingVersion ?? "missing")}`
        );
      }
      rawIds.push(...batch.map((chunk) => chunk.id));
      nextRawChunk = i + batch.length;
      if (typeof onRawProgress === "function") {
        await onRawProgress({ ids: [...rawIds], nextChunk: nextRawChunk });
      }
      console.log(`Upserted ${result.upserted} chunks (${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length})`);
    }
  }

  const mapResult = ingestMap
    ? await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint, {
        startPage: mapStartPage,
        initialIds: initialMapIds,
        onProgress: onMapProgress,
      })
    : null;
  if (ingestMap) {
    console.log(`Created ${mapResult.ids.length} document knowledge-map nodes`);
  }

  return {
    ids: ingestRaw ? rawIds : null,
    rawComplete: !ingestRaw || nextRawChunk >= chunks.length,
    nextRawChunk,
    mapIds: mapResult?.ids ?? null,
    mapComplete: mapResult?.complete ?? true,
    mapNextPage: mapResult?.nextPage ?? null,
  };
}

async function processText(
  file,
  accessToken,
  ingestToken,
  { rawStartChunk = 0, initialRawIds = [], onRawProgress = null } = {}
) {
  const text = await downloadText(file.id, accessToken);
  const chunks = splitIntoChunks(text).map((part, chunkIndex) => ({
    id: vectorId(file.id, 1, chunkIndex),
    text: part,
    sourceFileId: file.id,
    fileName: file.name,
    sourcePath: file.sourcePath,
    page: 1,
    chunkIndex,
    modifiedTime: file.modifiedTime || undefined,
    sourceFingerprint: fingerprint(file),
    languageHint: detectLanguageHint(file.name),
    documentGroupHint: documentGroupHint(file.name),
  }));
  const ids = Array.isArray(initialRawIds) ? [...initialRawIds] : [];
  let nextRawChunk = Math.max(0, rawStartChunk);
  for (let i = nextRawChunk; i < chunks.length; i += BATCH_SIZE) {
    if (ingestionBudget.snapshot().remaining < GEMINI_CALLS_PER_RAW_BATCH) {
      console.log(`Raw-vector budget checkpoint reached at chunk ${i}/${chunks.length}`);
      break;
    }
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const result = await callIngest({ action: "upsert", chunks: batch }, ingestToken);
    if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
      throw new Error("Ingestion endpoint raw embedding version mismatch");
    }
    ids.push(...batch.map((chunk) => chunk.id));
    nextRawChunk = i + batch.length;
    if (typeof onRawProgress === "function") {
      await onRawProgress({ ids: [...ids], nextChunk: nextRawChunk });
    }
  }
  console.log(`Indexed ${nextRawChunk}/${chunks.length} text chunks from ${file.sourcePath}`);
  return {
    ids,
    rawComplete: nextRawChunk >= chunks.length,
    nextRawChunk,
    mapIds: [],
  };
}

async function main() {
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const ingestToken = process.env.ELEVATOR_INGESTION_TOKEN;

  if (!serviceAccountRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");
  if (!ingestToken) throw new Error("ELEVATOR_INGESTION_TOKEN is missing");

  const serviceAccount = JSON.parse(serviceAccountRaw);
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const allFiles = await listFolder(DRIVE_FOLDER_ID, accessToken);
  const files = TARGET_FILE_ID ? allFiles.filter((file) => file.id === TARGET_FILE_ID) : allFiles;
  if (TARGET_FILE_ID && !files.length) throw new Error("Target file not found in Drive scope");
  const state = await loadState();
  state.version = 3;
  state.scopes ||= {};
  const scope = state.scopes[DRIVE_FOLDER_ID] || { files: {} };
  scope.files ||= {};

  console.log(`Found ${files.length} supported documents in Drive scope ${DRIVE_FOLDER_ID}`);
  console.log(
    `Gemini ingestion safety budget: at most ${ingestionBudget.snapshot().limit} calls in this process.`
  );

  const foundIds = new Set(allFiles.map((file) => file.id));
  for (const [fileId, old] of Object.entries(TARGET_FILE_ID ? {} : scope.files)) {
    if (!foundIds.has(fileId)) {
      const oldIds = Array.from(
        new Set([
          ...(Array.isArray(old.ids) ? old.ids : []),
          ...(Array.isArray(old.evidenceIds) ? old.evidenceIds : []),
          ...(Array.isArray(old.partialRawIds) ? old.partialRawIds : []),
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

  const plan = createIngestionPlan(files, scope.files, FORCE_REINGEST);
  const changed = plan.files;
  console.log(
    `${changed.length} document(s) need the ${plan.phase} phase; exact evidence, semantic vectors and document maps advance archive-wide without file-specific routing`
  );

  const selected = changed.slice(0, Math.max(0, MAX_FILES));

  for (const file of selected) {
    const previous = scope.files[file.id] || {};
    const currentFingerprint = fingerprint(file);
    const isText = file.mimeType === "text/plain" || TEXT_EXTENSIONS.has(extname(file.name).toLowerCase());
    const needsEvidence = plan.phase === "evidence";
    const needsRaw = plan.phase === "raw";
    const needsMap = plan.phase === "map";

    const next = {
      ...previous,
      name: file.name,
      sourcePath: file.sourcePath,
      modifiedTime: file.modifiedTime || null,
    };

    if (needsEvidence) {
      console.log(`Exact-evidence index backfill required for ${file.name}`);
      const evidenceIds = await processEvidenceIndex(file, accessToken, ingestToken);
      const evidenceIdSet = new Set(evidenceIds);
      const staleEvidenceIds = (Array.isArray(previous.evidenceIds)
        ? previous.evidenceIds
        : []
      ).filter((id) => !evidenceIdSet.has(id));
      if (staleEvidenceIds.length) await deleteIds(staleEvidenceIds, ingestToken);
      next.evidenceIds = evidenceIds;
      next.archiveIndexVersion = ARCHIVE_INDEX_VERSION;
      next.evidenceFingerprint = currentFingerprint;
      next.evidenceIndexedAt = new Date().toISOString();
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(`Exact-evidence checkpoint saved for ${file.name}`);
    }

    if (needsRaw) {
      console.log(`Raw-vector backfill required for ${file.name}`);
      const canResumeRaw =
        previous.partialRawEmbeddingVersion === RAW_EMBEDDING_VERSION &&
        previous.partialRawFingerprint === currentFingerprint &&
        Array.isArray(previous.partialRawIds) &&
        Number.isInteger(previous.rawNextChunk) &&
        previous.rawNextChunk > 0;
      const rawStartChunk = canResumeRaw ? previous.rawNextChunk : 0;
      const initialRawIds = canResumeRaw ? previous.partialRawIds : [];

      if (!canResumeRaw) {
        delete next.partialRawIds;
        delete next.partialRawEmbeddingVersion;
        delete next.partialRawFingerprint;
        delete next.rawNextChunk;
        delete next.rawProgressAt;
      }

      const indexedRaw = await (isText
        ? processText(file, accessToken, ingestToken, {
            rawStartChunk,
            initialRawIds,
            onRawProgress: async ({ ids, nextChunk }) => {
              next.partialRawIds = ids;
              next.partialRawEmbeddingVersion = RAW_EMBEDDING_VERSION;
              next.partialRawFingerprint = currentFingerprint;
              next.rawNextChunk = nextChunk;
              next.rawProgressAt = new Date().toISOString();
              scope.files[file.id] = next;
              state.scopes[DRIVE_FOLDER_ID] = scope;
              await saveState(state);
            },
          })
        : processPdf(file, accessToken, ingestToken, {
            ingestRaw: true,
            ingestMap: false,
            rawStartChunk,
            initialRawIds,
            onRawProgress: async ({ ids, nextChunk }) => {
              next.partialRawIds = ids;
              next.partialRawEmbeddingVersion = RAW_EMBEDDING_VERSION;
              next.partialRawFingerprint = currentFingerprint;
              next.rawNextChunk = nextChunk;
              next.rawProgressAt = new Date().toISOString();
              scope.files[file.id] = next;
              state.scopes[DRIVE_FOLDER_ID] = scope;
              await saveState(state);
            },
          }));
      const newIds = Array.isArray(indexedRaw.ids) ? indexedRaw.ids : [];

      if (!indexedRaw.rawComplete) {
        next.partialRawIds = newIds;
        next.partialRawEmbeddingVersion = RAW_EMBEDDING_VERSION;
        next.partialRawFingerprint = currentFingerprint;
        next.rawNextChunk = indexedRaw.nextRawChunk;
        next.rawProgressAt = new Date().toISOString();
        scope.files[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
        console.log(`Raw-vector progress checkpoint saved for ${file.name}`);
        continue;
      }

      const newIdSet = new Set(newIds);
      const staleRawIds = (Array.isArray(previous.ids) ? previous.ids : []).filter(
        (id) => !newIdSet.has(id)
      );
      if (staleRawIds.length) await deleteIds(staleRawIds, ingestToken);

      next.ids = newIds;
      next.rawEmbeddingVersion = RAW_EMBEDDING_VERSION;
      next.rawFingerprint = currentFingerprint;
      next.rawIndexedAt = new Date().toISOString();
      delete next.partialRawIds;
      delete next.partialRawEmbeddingVersion;
      delete next.partialRawFingerprint;
      delete next.rawNextChunk;
      delete next.rawProgressAt;
      scope.files[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(`Raw-vector checkpoint saved for ${file.name}`);
    }

    if (needsMap) {
      if (isText) {
        next.mapIds = [];
        next.mapVersion = DOCUMENT_MAP_VERSION;
        next.mapFingerprint = currentFingerprint;
        next.mapIndexedAt = new Date().toISOString();
        next.fingerprint = currentFingerprint;
        next.indexedAt = new Date().toISOString();
        scope.files[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
        continue;
      }
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

      if (!indexedMap.mapComplete) {
        next.partialMapIds = newMapIds;
        next.partialMapVersion = DOCUMENT_MAP_VERSION;
        next.partialMapFingerprint = currentFingerprint;
        next.mapNextPage = indexedMap.mapNextPage;
        next.mapProgressAt = new Date().toISOString();
        scope.files[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
        console.log(`Document-map progress checkpoint saved for ${file.name}`);
        continue;
      }
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

  const budget = ingestionBudget.snapshot();
  console.log(
    `Done. Processed ${selected.length} file(s); ${Math.max(0, changed.length - selected.length)} changed file(s) remain. Gemini calls reserved: ${budget.reserved}/${budget.limit}.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  ARCHIVE_INDEX_VERSION,
  DOCUMENT_MAP_VERSION,
  RAW_EMBEDDING_VERSION,
  fingerprint,
  needsMapBackfill,
  needsEvidenceBackfill,
  needsRawBackfill,
  createIngestionCallBudget,
  createIngestionPlan,
  estimateRawGeminiCalls,
};
