import { createHash, createSign } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractText, getDocumentProxy } from "unpdf";
import { resolveDocumentIdentity, detectDocumentLanguage } from "./document-identity.mjs";
import { assertShardState, shardForDocumentId, validateShardParameters } from "./archive-sharding.mjs";
import { createIngestionCoordinatorSession } from "./ingestion-coordinator-client.mjs";
import {
  assertManualQaV2Environment,verifyV2StageBatch,verifyV2EvidenceReceipt,
  buildQaImmutableManifest,assertQaImmutablePublish,updateQaDeletionCandidate,
} from "./ingestion-v2-qa-guard.mjs";
let activeCoordinator = null;

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
const V2_QA=process.env.INGESTION_V2_QA_MODE==="true";
const IMMUTABLE_ENDPOINT=process.env.INGESTION_IMMUTABLE_ENDPOINT;
const INGEST_ENDPOINT = process.env.INGEST_ENDPOINT || "https://elevator.help/api/drive-ingest-batch";
const DOCUMENT_MAP_ENDPOINT =
  process.env.DOCUMENT_MAP_ENDPOINT || "https://elevator.help/api/document-map-ingest";
const STATE_PATH = process.env.STATE_PATH || ".ingestion-state/drive.json";
const shardEnabled = process.env.ARCHIVE_SHARD_INDEX !== undefined || process.env.ARCHIVE_SHARD_COUNT !== undefined;
const shardIndex = Number(process.env.ARCHIVE_SHARD_INDEX);
const shardCount = Number(process.env.ARCHIVE_SHARD_COUNT);
if (shardEnabled) validateShardParameters(shardIndex, shardCount);
const BATCH_SIZE = 8;
const CHUNK_SIZE = 2200;
const CHUNK_OVERLAP = 250;
const MIN_CHUNK_LENGTH = 20;
const MAP_PAGES_PER_BATCH = 6;
const MAX_MAP_PAGE_TEXT = 7000;
const DOCUMENT_MAP_VERSION = 4;
const RAW_EMBEDDING_VERSION = 3;
const ARCHIVE_INDEX_VERSION = 3;
const GEMINI_CALLS_PER_RAW_BATCH = 2;
const GEMINI_CALLS_PER_MAP_WINDOW = 3;
// Hard stop against unbounded prepaid Gemini API usage in a single archive run.
// Workflow can raise its bounded run to 60 calls; the script rejects higher values.
const MAX_GEMINI_CALLS_HARD_CEILING = 60;
const MAX_GEMINI_CALLS = Number(process.env.MAX_GEMINI_CALLS || "30");

function createIngestionCallBudget(limitValue = MAX_GEMINI_CALLS) {
  const limit = Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GEMINI_CALLS_HARD_CEILING) {
    throw new Error(`MAX_GEMINI_CALLS must be an integer between 1 and ${MAX_GEMINI_CALLS_HARD_CEILING}`);
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

function assertQaDrivePdfIntegrity(file,bytes){
  if(!V2_QA)return;
  if(file?.mimeType!=="application/pdf" ||
     !/^[a-fA-F0-9]{32}$/.test(file?.md5Checksum||"") ||
     createHash("md5").update(bytes).digest("hex").toLowerCase()!==file.md5Checksum.toLowerCase())
    throw Error("V2_QA_PDF_SOURCE_CHECKSUM_MISMATCH");
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
  const bytes=new Uint8Array(await response.arrayBuffer());
  assertQaDrivePdfIntegrity(file,bytes);
  return bytes;
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

function createIngestionPlan(files, records = {}, force = false, preferredPhase = "evidence") {
  const ordered = prioritizeChangedFiles(files);
  const evidence = ordered.filter((file) =>
    (needsEvidenceBackfill(records[file.id], fingerprint(file), force) ||
      (records[file.id]?.name && (records[file.id].name !== file.name || records[file.id].sourcePath !== file.sourcePath)))
  );
  const evidencePending = new Set(evidence.map((file) => file.id));
  const raw = ordered.filter((file) =>
    !evidencePending.has(file.id) &&
    (needsRawBackfill(records[file.id], fingerprint(file), force) || records[file.id]?.metadataRefreshPendingRaw)
  );
  const rawPending = new Set(raw.map((file) => file.id));
  const map = ordered.filter((file) =>
    !evidencePending.has(file.id) && !rawPending.has(file.id) &&
    (needsMapBackfill(records[file.id], fingerprint(file), force) || records[file.id]?.metadataRefreshPendingMap)
  );
  const queues = { evidence, raw, map };
  // Report both the full backlog and the work currently eligible after
  // per-document prerequisites. These are counts only, not private filenames.
  const pendingCounts = {
    evidence: evidence.length,
    raw: ordered.filter((file) =>
      needsRawBackfill(records[file.id], fingerprint(file), force) ||
      records[file.id]?.metadataRefreshPendingRaw
    ).length,
    map: ordered.filter((file) =>
      needsMapBackfill(records[file.id], fingerprint(file), force) ||
      records[file.id]?.metadataRefreshPendingMap
    ).length,
  };
  const readyCounts = {
    evidence: evidence.length, raw: raw.length, map: map.length,
  };
  const phaseOrder = ["evidence", "raw", "map"];
  const preferredIndex = phaseOrder.indexOf(preferredPhase);
  const start = preferredIndex < 0 ? 0 : preferredIndex;
  for (let offset = 0; offset < phaseOrder.length; offset++) {
    const phase = phaseOrder[(start + offset) % phaseOrder.length];
    if (queues[phase].length) return { phase, files: queues[phase], pendingCounts, readyCounts };
  }
  return { phase: "map", files: [], pendingCounts, readyCounts };
}

// A phase can contain more pending files than MAX_FILES permits in one run.
// Persisting a cursor prevents a permanently failing or unusually large file
// at the front of the alphabetical queue from blocking all later documents.
function ingestionSortKey(file) {
  return `${String(file.sourcePath || file.name || "")}\u0000${String(file.id || "")}`;
}

function selectFairIngestionBatch(files, maxFiles, lastCursor = null) {
  const ordered = [...files].sort((a, b) =>
    ingestionSortKey(a).localeCompare(ingestionSortKey(b), "en")
  );
  const requested = Number(maxFiles);
  const count = Number.isFinite(requested)
    ? Math.min(ordered.length, Math.max(0, Math.floor(requested)))
    : 0;
  if (!count) return { files: [], nextCursor: lastCursor };

  // The cursor is a stable path + Drive ID, not an array offset: completed
  // files disappear from the queue, while newly uploaded files can be added.
  const nextIndex = lastCursor == null
    ? 0
    : ordered.findIndex((file) =>
        ingestionSortKey(file).localeCompare(lastCursor, "en") > 0
      );
  const start = nextIndex < 0 ? 0 : nextIndex;
  const selected = Array.from(
    { length: count },
    (_, index) => ordered[(start + index) % ordered.length]
  );
  return {
    files: selected,
    nextCursor: ingestionSortKey(selected[selected.length - 1]),
  };
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
  const source=file.md5Checksum || `${file.modifiedTime || ""}:${file.size || ""}`;
  // A staging revision changes when the embedding/map/evidence algorithms change.
  // The legacy scheduled serial writer retains its exact previous fingerprint.
  return V2_QA ? createHash("sha256").update(JSON.stringify([
    source,file.name||"",file.sourcePath||"",
    RAW_EMBEDDING_VERSION,DOCUMENT_MAP_VERSION,ARCHIVE_INDEX_VERSION,
    "v2-immutable-drive-pdf",
  ])).digest("hex") : source;
}

async function loadState() {
  return readIngestionState();
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

// Resume only checkpoints that describe a complete, contiguous processed prefix.
// An inconsistent chunk count must restart at zero instead of silently skipping data.
function canResumeEvidence(previous, currentFingerprint) {
  return previous?.partialArchiveIndexVersion === ARCHIVE_INDEX_VERSION &&
    previous?.partialEvidenceFingerprint === currentFingerprint &&
    Array.isArray(previous?.partialEvidenceIds) &&
    Number.isInteger(previous?.evidenceNextChunk) &&
    previous.evidenceNextChunk > 0 &&
    previous.partialEvidenceIds.length === previous.evidenceNextChunk;
}

function canResumeRaw(previous, currentFingerprint) {
  return previous?.partialRawEmbeddingVersion === RAW_EMBEDDING_VERSION &&
    previous?.partialRawFingerprint === currentFingerprint &&
    Array.isArray(previous?.partialRawIds) &&
    Number.isInteger(previous?.rawNextChunk) &&
    previous.rawNextChunk > 0 &&
    previous.partialRawIds.length === previous.rawNextChunk;
}

function canResumeMap(previous, currentFingerprint) {
  return previous?.partialMapVersion === DOCUMENT_MAP_VERSION &&
    previous?.partialMapFingerprint === currentFingerprint &&
    Array.isArray(previous?.partialMapIds) &&
    Number.isInteger(previous?.mapNextPage) &&
    previous.mapNextPage > 1;
}

// A partially written or corrupted checkpoint must never be mistaken for an
// empty archive: that could trigger a costly, archive-wide re-ingestion.
async function readIngestionState(
  filePath = STATE_PATH,
  allowEmpty = process.env.ALLOW_EMPTY_INGESTION_STATE === "true"
) {
  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      if (allowEmpty) return { version: 3, scopes: {} };
      throw new Error("INGESTION_STATE_MISSING: explicit bootstrap required before ingestion");
    }
    throw new Error("INGESTION_STATE_READ_FAILED", { cause: error });
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("INGESTION_STATE_CORRUPT: invalid JSON; refusing automatic reindex");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      !parsed.scopes || typeof parsed.scopes !== "object" ||
      Array.isArray(parsed.scopes)) {
    throw new Error("INGESTION_STATE_CORRUPT: invalid checkpoint structure");
  }
  return parsed;
}

async function writeIngestionState(state, filePath = STATE_PATH) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    // Rename within the same directory is atomic on the GitHub Actions runner.
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function saveState(state) {
  if (shardEnabled) assertShardState(state, shardIndex, shardCount);
  try {
    // D1 is the authoritative checkpoint in explicit coordinated mode.
    // Persist the same state to GitHub Actions cache only AFTER the D1 CAS.
    if (activeCoordinator) await activeCoordinator.checkpoint(state);
    return await writeIngestionState(state);
  } catch (error) {
    throw new Error("INGESTION_STATE_WRITE_FAILED: stopping to avoid uncheckpointed writes", { cause: error });
  }
}

async function callJsonEndpoint(endpoint, payload, token, label) {
  if (activeCoordinator) {
    await activeCoordinator.assertLive();
    payload = {...payload,globalArchiveLease:activeCoordinator.lease};
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Node fetch throws TypeError for transport failures. Do not expose
    // endpoint URLs, request bodies, source names or upstream error causes.
    if (error instanceof TypeError) {
      throw new Error("INGESTION_ENDPOINT_TRANSPORT_FAILURE", { cause: error });
    }
    throw error;
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data?.ok === false) {
    if(V2_QA)throw Error("V2_QA_ENDPOINT_REJECTED");
    throw new Error(`${label} error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function callIngest(payload, token) {
  if (payload?.action === "upsert" || payload?.action === "stage_upsert_v2") {
    ingestionBudget.reserve(GEMINI_CALLS_PER_RAW_BATCH, "raw chunk batch");
  }
  return callJsonEndpoint(INGEST_ENDPOINT, payload, token, "Ingestion endpoint");
}

async function callDocumentMap(payload, token) {
  ingestionBudget.reserve(GEMINI_CALLS_PER_MAP_WINDOW, "document-map window");
  return callJsonEndpoint(DOCUMENT_MAP_ENDPOINT, payload, token, "Document-map endpoint");
}

async function deleteIds(ids, token) {
  if(V2_QA)throw Error("V2_QA_UNVERSIONED_DELETE_DENIED");
  for (let i = 0; i < ids.length; i += 100) {
    await callIngest({ action: "delete", ids: ids.slice(i, i + 100) }, token);
  }
}

async function processEvidenceIndex(
  file, accessToken, ingestToken,
  { startChunk = 0, initialIds = [], onProgress = null, onIdentity = null, onQuality = null,
    stageRecord = null } = {}
) {
  const groupHint = documentGroupHint(file.name);
  let pages;
  if (file.mimeType === "text/plain" || TEXT_EXTENSIONS.has(extname(file.name).toLowerCase())) {
    pages = [await downloadText(file.id, accessToken)];
  } else {
    console.log('Downloading archive document (source path redacted)');
    const original = await downloadDocument(file, accessToken);
    const bytes = file.mimeType === "application/pdf" || GOOGLE_WORKSPACE_MIME_TYPES.has(file.mimeType)
      ? original
      : await officeToPdf(file, original);
    const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
    const extracted = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  }

  // Extraction-quality gate: flag image-only PDFs without spending model tokens.
  // Do not treat a successful PDF parse as evidence that readable text exists.
  // An empty text layer is not proof of a bad page: it may be blank or
  // image-only. Never mark these pages as verified without visual review.
  const suspectPages = pages.flatMap((page, index) =>
    normalizeText(page).length < MIN_CHUNK_LENGTH ? [index + 1] : []
  );
  const quality = {
    status: suspectPages.length ? "review_required" : "text_layer_complete",
    totalPages: pages.length,
    readablePages: pages.length - suspectPages.length,
    suspectPages,
    // This is a text-layer check, not proof that tables/figures were captured.
    check: "text_layer_minimum_length",
  };
  if (typeof onQuality === "function") onQuality(quality);
  if (suspectPages.length) {
    console.warn(`EXTRACTION_REVIEW_REQUIRED: ${quality.readablePages}/${quality.totalPages} readable pages; ${suspectPages.length} pages need visual review (source redacted)`);
  }
  const identity = resolveDocumentIdentity({fileId: file.id, fileName: file.name,
    sourcePath: file.sourcePath, text: pages.slice(0, 3).join(' ')});
  const languageHint = identity.language;
  if (typeof onIdentity === 'function') onIdentity(identity);
  console.log(`Document identity resolved: type=${identity.documentType || 'unknown'}, language=${identity.language || 'unknown'}`);
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

  const ids = [...initialIds];
  for (let index = startChunk; index < chunks.length; index += BATCH_SIZE) {
    const batch = chunks.slice(index, index + BATCH_SIZE);
    if(V2_QA){
      for(const chunk of batch){
        const result=await callJsonEndpoint(IMMUTABLE_ENDPOINT,{
          action:"stage_evidence",documentId:file.id,
          evidence:{
            logicalId:chunk.id,sourceFingerprint:chunk.sourceFingerprint,
            text:chunk.text,fileName:chunk.fileName,sourcePath:chunk.sourcePath,
            page:chunk.page,chunkIndex:chunk.chunkIndex,
          },
        },ingestToken,"Immutable Evidence");
        verifyV2EvidenceReceipt(result,chunk.id,stageRecord);
      }
    }else{
      const result=await callJsonEndpoint(
        INGEST_ENDPOINT,{action:"index_evidence",chunks:batch},
        ingestToken,"Archive evidence endpoint",
      );
      if(result?.archiveIndexVersion!==ARCHIVE_INDEX_VERSION)
        throw Error("ARCHIVE_EVIDENCE_VERSION_MISMATCH");
    }
    ids.push(...batch.map((chunk) => chunk.id));
    if (typeof onProgress === "function") {
      await onProgress({ ids: [...ids], nextChunk: index + batch.length });
    }
  }
  console.log(`Indexed ${chunks.length} exact-evidence chunks without model-specific routing`);
  return ids;
}

async function buildDocumentMap(
  file,
  pages,
  ingestToken,
  languageHint,
  groupHint,
  { startPage = 1, initialIds = [], onProgress = null,stageRecord=null } = {}
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
    const result = await callDocumentMap({
      ...(V2_QA?{action:"stage_map_v2"}:{}),document,pages:window,
    },ingestToken);
    if(V2_QA && (!Number.isSafeInteger(result?.mapCount) ||
       result.mapCount<1||result.mapCount>12))
      throw Error("V2_QA_MAP_RECEIPT_COUNT_INVALID");
    const ids = V2_QA
      ? verifyV2StageBatch(result,Array.from({length:result.mapCount}),
        "map",stageRecord)
      : Array.isArray(result?.ids) ? result.ids : [];
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
    stageRecord = null,
    mapStartPage = 1,
    initialMapIds = [],
    onMapProgress = null,
  } = {}
) {
  console.log('Downloading archive document (source path redacted)');
  const original = await downloadDocument(file, accessToken);
  const bytes = file.mimeType === "application/pdf" || GOOGLE_WORKSPACE_MIME_TYPES.has(file.mimeType)
    ? original
    : await officeToPdf(file, original);
  const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const chunks = [];
  const languageHint = detectDocumentLanguage(pages.slice(0, 3).join(' '), file.name);
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
      const result = await callIngest({
        action:V2_QA?"stage_upsert_v2":"upsert",chunks:batch,
      },ingestToken);
      if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
        throw new Error(
          `Ingestion endpoint raw embedding version mismatch: expected ${RAW_EMBEDDING_VERSION}, got ${String(result?.rawEmbeddingVersion ?? "missing")}`
        );
      }
      const insertedIds=V2_QA
        ? verifyV2StageBatch(result,batch,"raw",stageRecord)
        : batch.map(chunk=>chunk.id);
      rawIds.push(...insertedIds);
      nextRawChunk = i + batch.length;
      if (typeof onRawProgress === "function") {
        await onRawProgress({ ids: [...rawIds], nextChunk: nextRawChunk });
      }
      console.log(`Processed ${batch.length} raw chunks (${Math.min(i+BATCH_SIZE,chunks.length)}/${chunks.length})`);
    }
  }

  const mapResult = ingestMap
    ? await buildDocumentMap(file, pages, ingestToken, languageHint, groupHint, {
        startPage: mapStartPage,
        initialIds: initialMapIds,
        onProgress: onMapProgress,
        stageRecord,
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
  { rawStartChunk = 0, initialRawIds = [], onRawProgress = null,stageRecord=null } = {}
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
    languageHint: detectDocumentLanguage(text, file.name),
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
    const result = await callIngest({
      action:V2_QA?"stage_upsert_v2":"upsert",chunks:batch,
    },ingestToken);
    if (result?.rawEmbeddingVersion !== RAW_EMBEDDING_VERSION) {
      throw new Error("Ingestion endpoint raw embedding version mismatch");
    }
    const insertedIds=V2_QA
      ? verifyV2StageBatch(result,batch,"raw",stageRecord)
      : batch.map(chunk=>chunk.id);
    ids.push(...insertedIds);
    nextRawChunk = i + batch.length;
    if (typeof onRawProgress === "function") {
      await onRawProgress({ ids: [...ids], nextChunk: nextRawChunk });
    }
  }
  console.log(`Indexed ${nextRawChunk}/${chunks.length} text chunks (source path redacted)`);
  return {
    ids,
    rawComplete: nextRawChunk >= chunks.length,
    nextRawChunk,
    mapIds: [],
  };
}

// A pure scheduler helper so the persisted phase rotation can be tested offline.
function nextPreferredIngestionPhase(lastSelectedPhase) {
  const order = ["evidence", "raw", "map"];
  const previous = order.indexOf(lastSelectedPhase);
  return order[(previous + 1) % order.length];
}

async function main() {
  if(V2_QA)assertManualQaV2Environment(process.env);
  const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const ingestToken = process.env.ELEVATOR_INGESTION_TOKEN;

  if (!serviceAccountRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");
  if (!ingestToken) throw new Error("ELEVATOR_INGESTION_TOKEN is missing");

  const serviceAccount = JSON.parse(serviceAccountRaw);
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const allFiles = await listFolder(DRIVE_FOLDER_ID, accessToken);
  const shardFiles = shardEnabled
    ? allFiles.filter((file) => shardForDocumentId(file.id, shardCount) === shardIndex)
    : allFiles;
  const selectedScopeFiles=TARGET_FILE_ID
    ? shardFiles.filter(file=>file.id===TARGET_FILE_ID) : shardFiles;
  // Immutable V2 pilot never marks a text-only document with an empty Map as complete.
  const files=V2_QA?selectedScopeFiles.filter(file=>file.mimeType==="application/pdf"):selectedScopeFiles;
  if (TARGET_FILE_ID && !files.length) throw new Error("Target file not found in Drive scope");
  // In QA, a missing local evictable cache is allowed only because the strict
  // coordinator MUST provide an existing durable D1 checkpoint. No bootstrap.
  let state = V2_QA ? await readIngestionState(STATE_PATH,true) : await loadState();
  if (process.env.INGESTION_D1_COORDINATOR_MODE === "strict") {
    if (shardEnabled || TARGET_FILE_ID || FORCE_REINGEST ||
        process.env.GITHUB_ACTIONS !== "true" ||
        process.env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
        process.env.INGESTION_D1_EXPLICIT_RUN_ID !== process.env.GITHUB_RUN_ID) {
      throw new Error("D1_COORDINATOR_UNAPPROVED_RUNNER_MODE");
    }
    activeCoordinator = await createIngestionCoordinatorSession({
      token:ingestToken,rootId:DRIVE_FOLDER_ID,
      runId:process.env.GITHUB_RUN_ID,
      runAttempt:process.env.GITHUB_RUN_ATTEMPT || "1",
      legacyState:state,
      bootstrapApproved:process.env.INGESTION_D1_BOOTSTRAP_APPROVED === "true",
      ...(V2_QA?{qaOnly:true,endpoint:process.env.INGESTION_COORDINATOR_ENDPOINT}:{}),
    });
    state = activeCoordinator.state;
  }
  try {
  // Reject an old serial checkpoint, or the OTHER worker's checkpoint, before any writes.
  if (shardEnabled) assertShardState(state, shardIndex, shardCount);
  else if (state.parallelShard) throw new Error("SERIAL_WORKER_CANNOT_USE_PARALLEL_CHECKPOINT");
  state.version = 3;
  state.scopes ||= {};
  const scope = state.scopes[DRIVE_FOLDER_ID] || { files: {} };
  scope.files ||= {};
  const workFiles=V2_QA?(scope.v2Files ||= {}):scope.files;

  console.log(`Found ${files.length} supported documents in configured Drive scope${shardEnabled ? " (assigned shard only)" : ""}`);
  console.log(
    `Gemini ingestion safety budget: at most ${ingestionBudget.snapshot().limit} calls in this process.`
  );

  const foundIds = new Set(shardFiles.map((file) => file.id));
  for (const [fileId, old] of Object.entries(TARGET_FILE_ID ? {} : workFiles)) {
    if (!foundIds.has(fileId)) {
      if(V2_QA){
        workFiles[fileId]=updateQaDeletionCandidate(old,true);
        continue; // Hold tombstone; never delete V2 published data here.
      }
      // A single incomplete Drive scan must never erase archived evidence.
      if ((old.missingScanCount || 0) < 1) {
        scope.files[fileId] = {...old, missingScanCount: 1};
        console.log(`Missing Drive file (ID redacted); awaiting a second complete scan before deletion`);
        continue;
      }
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
        console.log(`Removing ${oldIds.length} vectors for deleted Drive file (ID redacted)`);
        await deleteIds(oldIds, ingestToken);
      }
      delete scope.files[fileId];
    }
  }

  for (const file of shardFiles) {
    if(V2_QA && workFiles[file.id]?.missingScanCount)
      workFiles[file.id]=updateQaDeletionCandidate(workFiles[file.id],false);
    else if(workFiles[file.id]?.missingScanCount)
      delete workFiles[file.id].missingScanCount;
  }
  // Persist the phase rotation per Drive scope instead of deriving it from wall-clock
  // time: delayed GitHub schedules must not repeatedly skip an eligible phase.
  // createIngestionPlan still enforces evidence -> raw -> map dependencies per file.
  const preferredPhase=nextPreferredIngestionPhase(
    V2_QA?scope.v2LastSelectedPhase:scope.lastSelectedPhase
  );
  const plan = createIngestionPlan(files,workFiles,FORCE_REINGEST,preferredPhase);
  console.log(`Ingestion phase preference: ${preferredPhase}; selected: ${plan.phase}`);
  console.log(`Archive backlog (all pending): evidence=${plan.pendingCounts.evidence}, raw=${plan.pendingCounts.raw}, map=${plan.pendingCounts.map}`);
  console.log(`Archive eligible queues: evidence=${plan.readyCounts.evidence}, raw=${plan.readyCounts.raw}, map=${plan.readyCounts.map}`);
  const changed=V2_QA
    ? [...plan.files,...files.filter(file=>
        !plan.files.some(p=>p.id===file.id) &&
        workFiles[file.id]?.publishedFingerprint!==fingerprint(file) &&
        buildQaImmutableManifest(workFiles[file.id],fingerprint(file))
      )]
    : plan.files;
  console.log(
    `${changed.length} document(s) need the ${plan.phase} phase; exact evidence, semantic vectors and document maps advance archive-wide without file-specific routing`
  );

  scope.phaseCursors ||= {};
  scope.v2PhaseCursors ||= {};
  const cursors=V2_QA?scope.v2PhaseCursors:scope.phaseCursors;
  const batch=selectFairIngestionBatch(changed,MAX_FILES,cursors[plan.phase]??null);
  const selected = batch.files;
  if (selected.length && !TARGET_FILE_ID) {
    // Record the attempted phase before external calls; retrying a failed run
    // must not repeatedly select the same phase and starve the others.
    if(V2_QA)scope.v2LastSelectedPhase=plan.phase;
    else scope.lastSelectedPhase=plan.phase;
    // Advance and checkpoint before any network call. A failed file cannot
    // pin the entire archive to the same first batch on the next scheduled run.
    cursors[plan.phase]=batch.nextCursor;
    state.scopes[DRIVE_FOLDER_ID] = scope;
    await saveState(state);
  }

  const fileErrors = [];
  for (const file of selected) {
    try {
    const previous = workFiles[file.id] || {};
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
    if(V2_QA && next.v2SourceFingerprint!==currentFingerprint){
      // Durable document epochs are revision-scoped, NOT per-run lease-scoped.
      delete next.documentEpoch;
      delete next.publishedFingerprint;
      delete next.publishedEpoch;
      next.v2SourceFingerprint=currentFingerprint;
    }

    if (needsEvidence) {
      if (previous.name && (previous.name !== file.name || previous.sourcePath !== file.sourcePath)) {
        next.metadataRefreshPendingRaw = true;
        next.metadataRefreshPendingMap = true;
      }
      console.log('Exact-evidence index backfill required for archive document');

      const resumeEvidence = canResumeEvidence(previous, currentFingerprint);
      if (!resumeEvidence) {
        delete next.partialEvidenceIds;
        delete next.partialArchiveIndexVersion;
        delete next.partialEvidenceFingerprint;
        delete next.evidenceNextChunk;
      }
      const evidenceIds = await processEvidenceIndex(file, accessToken, ingestToken, {
        onIdentity: (identity) => { next.documentIdentity = identity; },
        onQuality: (quality) => { next.extractionQuality = quality; },
        stageRecord:next,
        startChunk: resumeEvidence ? previous.evidenceNextChunk : 0,
        initialIds: resumeEvidence ? previous.partialEvidenceIds : [],
        onProgress: async ({ ids, nextChunk }) => {
          next.partialEvidenceIds = ids;
          next.partialArchiveIndexVersion = ARCHIVE_INDEX_VERSION;
          next.partialEvidenceFingerprint = currentFingerprint;
          next.evidenceNextChunk = nextChunk;
          workFiles[file.id] = next;
          state.scopes[DRIVE_FOLDER_ID] = scope;
          await saveState(state);
        },
      });
      const evidenceIdSet = new Set(evidenceIds);
      const staleEvidenceIds = (Array.isArray(previous.evidenceIds)
        ? previous.evidenceIds
        : []
      ).filter((id) => !evidenceIdSet.has(id));
      if (!V2_QA && staleEvidenceIds.length) await deleteIds(staleEvidenceIds, ingestToken);
      next.evidenceIds = evidenceIds;
      next.archiveIndexVersion = ARCHIVE_INDEX_VERSION;
      next.evidenceFingerprint = currentFingerprint;
      next.evidenceIndexedAt = new Date().toISOString();
      delete next.partialEvidenceIds;
      delete next.partialArchiveIndexVersion;
      delete next.partialEvidenceFingerprint;
      delete next.evidenceNextChunk;
      workFiles[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(`Exact-evidence checkpoint saved for archive document`);
    }

    if (needsRaw) {
      console.log('Raw-vector backfill required for archive document');
      const resumeRaw = canResumeRaw(previous, currentFingerprint);
      const rawStartChunk = resumeRaw ? previous.rawNextChunk : 0;
      const initialRawIds = resumeRaw ? previous.partialRawIds : [];

      if (!resumeRaw) {
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
            stageRecord:next,
            onRawProgress: async ({ ids, nextChunk }) => {
              next.partialRawIds = ids;
              next.partialRawEmbeddingVersion = RAW_EMBEDDING_VERSION;
              next.partialRawFingerprint = currentFingerprint;
              next.rawNextChunk = nextChunk;
              next.rawProgressAt = new Date().toISOString();
              workFiles[file.id] = next;
              state.scopes[DRIVE_FOLDER_ID] = scope;
              await saveState(state);
            },
          })
        : processPdf(file, accessToken, ingestToken, {
            ingestRaw: true,
            ingestMap: false,
            rawStartChunk,
            initialRawIds,
            stageRecord:next,
            onRawProgress: async ({ ids, nextChunk }) => {
              next.partialRawIds = ids;
              next.partialRawEmbeddingVersion = RAW_EMBEDDING_VERSION;
              next.partialRawFingerprint = currentFingerprint;
              next.rawNextChunk = nextChunk;
              next.rawProgressAt = new Date().toISOString();
              workFiles[file.id] = next;
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
        workFiles[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
        console.log(`Raw-vector progress checkpoint saved for archive document`);
        continue;
      }

      const newIdSet = new Set(newIds);
      const staleRawIds = (Array.isArray(previous.ids) ? previous.ids : []).filter(
        (id) => !newIdSet.has(id)
      );
      if (!V2_QA && staleRawIds.length) await deleteIds(staleRawIds, ingestToken);

      next.ids = newIds;
      next.rawEmbeddingVersion = RAW_EMBEDDING_VERSION;
      next.rawFingerprint = currentFingerprint;
      next.rawIndexedAt = new Date().toISOString();
      delete next.metadataRefreshPendingRaw;
      delete next.partialRawIds;
      delete next.partialRawEmbeddingVersion;
      delete next.partialRawFingerprint;
      delete next.rawNextChunk;
      delete next.rawProgressAt;
      workFiles[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(`Raw-vector checkpoint saved for archive document`);
    }

    if (needsMap) {
      if (isText) {
        next.mapIds = [];
        next.mapVersion = DOCUMENT_MAP_VERSION;
        next.mapFingerprint = currentFingerprint;
        next.mapIndexedAt = new Date().toISOString();
        delete next.metadataRefreshPendingMap;
        next.fingerprint = currentFingerprint;
        next.indexedAt = new Date().toISOString();
        workFiles[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
        continue;
      }
      console.log('Document-map backfill required for archive document');
      const resumeMap = canResumeMap(previous, currentFingerprint);
      const mapStartPage = resumeMap ? previous.mapNextPage : 1;
      const initialMapIds = resumeMap ? previous.partialMapIds : [];

      // A partial map belongs to the exact source fingerprint that created it.
      // If the Drive file changed (or the map schema/version changed), those
      // interrupted nodes must not survive while a fresh map is being built.
      if (!resumeMap && Array.isArray(previous.partialMapIds) && previous.partialMapIds.length) {
        console.log(
          `Removing ${previous.partialMapIds.length} stale partial map vectors for archive document`
        );
        if(!V2_QA)await deleteIds(previous.partialMapIds, ingestToken);
        delete next.partialMapIds;
        delete next.partialMapVersion;
        delete next.partialMapFingerprint;
        delete next.mapNextPage;
        delete next.mapProgressAt;
        workFiles[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
      }

      const indexedMap = await processPdf(file, accessToken, ingestToken, {
        ingestRaw: false,
        ingestMap: true,
        mapStartPage,
        initialMapIds,
        stageRecord:next,
        onMapProgress: async ({ ids, nextPage }) => {
          next.partialMapIds = ids;
          next.partialMapVersion = DOCUMENT_MAP_VERSION;
          next.partialMapFingerprint = currentFingerprint;
          next.mapNextPage = nextPage;
          next.mapProgressAt = new Date().toISOString();
          workFiles[file.id] = next;
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
        workFiles[file.id] = next;
        state.scopes[DRIVE_FOLDER_ID] = scope;
        await saveState(state);
        console.log(`Document-map progress checkpoint saved for archive document`);
        continue;
      }
      const newMapIdSet = new Set(newMapIds);
      const staleMapIds = Array.from(
        new Set([
          ...(Array.isArray(previous.mapIds) ? previous.mapIds : []),
          ...(Array.isArray(previous.partialMapIds) ? previous.partialMapIds : []),
        ])
      ).filter((id) => !newMapIdSet.has(id));
      if (!V2_QA && staleMapIds.length) await deleteIds(staleMapIds, ingestToken);

      next.mapIds = newMapIds;
      next.mapVersion = DOCUMENT_MAP_VERSION;
      next.mapFingerprint = currentFingerprint;
      next.mapIndexedAt = new Date().toISOString();
      delete next.metadataRefreshPendingMap;
      delete next.partialMapIds;
      delete next.partialMapVersion;
      delete next.partialMapFingerprint;
      delete next.mapNextPage;
      delete next.mapProgressAt;
      workFiles[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
      console.log(`Document-map checkpoint saved for archive document`);
    }

    if (V2_QA) {
      if(!isText){
        const manifest=buildQaImmutableManifest(next,currentFingerprint);
        if(manifest && next.publishedFingerprint!==currentFingerprint){
          // Complete layer receipts and their checkpoint exist before publication.
          const result=await callJsonEndpoint(IMMUTABLE_ENDPOINT,{
            action:"publish",documentId:file.id,manifest,
          },ingestToken,"Atomic V2 publication");
          assertQaImmutablePublish(result,next.documentEpoch);
          next.publishedFingerprint=currentFingerprint;
          next.publishedEpoch=next.documentEpoch;
          next.fingerprint=currentFingerprint;
          next.indexedAt=new Date().toISOString();
          workFiles[file.id]=next;
          state.scopes[DRIVE_FOLDER_ID]=scope;
          await saveState(state);
          console.log("PASS: Complete immutable PDF publication (source redacted)");
        }
      }
    }else if (next.rawFingerprint === currentFingerprint && next.mapFingerprint === currentFingerprint) {
      next.fingerprint = currentFingerprint;
      next.indexedAt = new Date().toISOString();
      workFiles[file.id] = next;
      state.scopes[DRIVE_FOLDER_ID] = scope;
      await saveState(state);
    }
    } catch (error) {
      // State persistence failures are systemic, not document-local. Continuing
      // would incur writes/API costs that cannot be resumed safely.
      if (V2_QA || String(error?.message || "").startsWith("INGESTION_STATE_WRITE_FAILED")) {
        throw Error(V2_QA?"V2_QA_DOCUMENT_STAGE_OR_PUBLISH_ABORTED":"INGESTION_STATE_WRITE_FAILED");
      }
      // Preserve successful checkpoints and allow other files in this bounded
      // run to advance; still fail the workflow so the problem is visible.
      // Do not emit raw endpoint error bodies: they can contain private source metadata.
      const failureKind = String(error?.message || "").includes("INGESTION_GEMINI_BUDGET_EXCEEDED")
        ? "INGESTION_GEMINI_BUDGET_EXCEEDED"
        : error instanceof Error ? error.name : "UnknownError";
      console.error("Archive document processing failed (source redacted); category:", failureKind);
      fileErrors.push(error);
    }
  }

  state.scopes[DRIVE_FOLDER_ID] = scope;
  await saveState(state);

  const budget = ingestionBudget.snapshot();
  console.log(
    `Done. Attempted ${selected.length} file(s); ${fileErrors.length} failed; ${Math.max(0, changed.length - selected.length)} not selected this run. Gemini calls reserved: ${budget.reserved}/${budget.limit}.`
  );
  if (fileErrors.length) {
    throw new Error(`INGESTION_DOCUMENT_FAILURES: ${fileErrors.length}/${selected.length} document(s) failed; see redacted error logs`);
  }
  } finally {
    if (activeCoordinator) {
      const session=activeCoordinator;
      activeCoordinator=null;
      await session.close();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if(V2_QA)console.error("V2_QA_INGESTION_ABORTED (source details redacted)");
    else console.error(error);
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
  nextPreferredIngestionPhase,
  selectFairIngestionBatch,
  canResumeEvidence,
  canResumeRaw,
  canResumeMap,
  readIngestionState,
  writeIngestionState,
  estimateRawGeminiCalls,
};
