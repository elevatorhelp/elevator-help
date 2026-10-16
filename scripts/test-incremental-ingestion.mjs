import {
  ARCHIVE_INDEX_VERSION,
  DOCUMENT_MAP_VERSION,
  RAW_EMBEDDING_VERSION,
  fingerprint,
  createIngestionCallBudget,
  createIngestionPlan,
  estimateRawGeminiCalls,
  needsMapBackfill,
  needsEvidenceBackfill,
  needsRawBackfill,
} from "./drive-ingest.mjs";

if (estimateRawGeminiCalls(0) !== 0 || estimateRawGeminiCalls(9) !== 4) {
  throw new Error("Raw ingestion call estimate must reserve two calls per batch");
}
const budget = createIngestionCallBudget(4);
budget.reserve(2, "test batch");
budget.reserve(2, "test batch");
let budgetBlocked = false;
try {
  budget.reserve(1, "overflow");
} catch (error) {
  budgetBlocked = String(error).includes("INGESTION_GEMINI_BUDGET_EXCEEDED");
}
if (!budgetBlocked) {
  throw new Error("Ingestion budget must stop work before exceeding its limit");
}

if (
  ARCHIVE_INDEX_VERSION !== 3 ||
  RAW_EMBEDDING_VERSION !== 3 ||
  DOCUMENT_MAP_VERSION !== 4
) {
  throw new Error("Unexpected multilingual ingestion schema versions");
}

const file = {
  md5Checksum: "abc123",
  modifiedTime: "2026-09-29T00:00:00Z",
  size: "42",
};
if (fingerprint(file) !== "abc123") {
  throw new Error("Drive MD5 must be the preferred source fingerprint");
}

const current = {
  evidenceFingerprint: "abc123",
  archiveIndexVersion: 3,
  evidenceIds: ["evidence-1"],
  rawFingerprint: "abc123",
  rawEmbeddingVersion: 3,
  ids: ["raw-1"],
  mapFingerprint: "abc123",
  mapVersion: 4,
  mapIds: ["map-1"],
};
if (
  needsRawBackfill(current, "abc123") ||
  needsEvidenceBackfill(current, "abc123") ||
  needsMapBackfill(current, "abc123")
) {
  throw new Error("Unchanged current documents must not be re-embedded");
}
if (!needsRawBackfill({ ...current, rawEmbeddingVersion: 2 }, "abc123")) {
  throw new Error("An older embedding version must trigger raw backfill");
}
if (!needsEvidenceBackfill({ ...current, archiveIndexVersion: 0 }, "abc123")) {
  throw new Error("An older exact-evidence index must trigger backfill");
}
if (!needsMapBackfill({ ...current, mapVersion: 3 }, "abc123")) {
  throw new Error("An older map version must trigger map backfill");
}
if (
  !needsRawBackfill(current, "changed") ||
  !needsEvidenceBackfill(current, "changed") ||
  !needsMapBackfill(current, "changed")
) {
  throw new Error("A changed Drive fingerprint must rebuild both layers");
}
if (
  !needsRawBackfill(current, "abc123", true) ||
  !needsEvidenceBackfill(current, "abc123", true) ||
  !needsMapBackfill(current, "abc123", true)
) {
  throw new Error("A bounded forced reingestion must rebuild both layers");
}

const genericFiles = [
  { id: "z", name: "ZX 410-22.pdf", sourcePath: "references/ZX 410-22.pdf", md5Checksum: "z" },
  { id: "a", name: "Any Topic.pdf", sourcePath: "manuals/Any Topic.pdf", md5Checksum: "a" },
];
const evidenceFirst = createIngestionPlan(genericFiles, {});
if (evidenceFirst.phase !== "evidence" || evidenceFirst.files.length !== 2) {
  throw new Error("Every source must enter the generic exact-evidence index first");
}

const rawFirst = createIngestionPlan(genericFiles, {
  z: {
    evidenceFingerprint: "z",
    archiveIndexVersion: ARCHIVE_INDEX_VERSION,
    evidenceIds: ["evidence-z"],
    rawFingerprint: "z",
    rawEmbeddingVersion: RAW_EMBEDDING_VERSION,
    ids: ["raw-z"],
  },
  a: {
    evidenceFingerprint: "a",
    archiveIndexVersion: ARCHIVE_INDEX_VERSION,
    evidenceIds: ["evidence-a"],
  },
});
if (rawFirst.phase !== "raw" || rawFirst.files[0]?.id !== "a") {
  throw new Error("Archive planning must prioritize missing raw coverage generically");
}

const mapAfterRaw = createIngestionPlan(genericFiles, {
  z: {
    evidenceFingerprint: "z",
    archiveIndexVersion: ARCHIVE_INDEX_VERSION,
    evidenceIds: ["evidence-z"],
    rawFingerprint: "z",
    rawEmbeddingVersion: RAW_EMBEDDING_VERSION,
    ids: ["raw-z"],
  },
  a: {
    evidenceFingerprint: "a",
    archiveIndexVersion: ARCHIVE_INDEX_VERSION,
    evidenceIds: ["evidence-a"],
    rawFingerprint: "a",
    rawEmbeddingVersion: RAW_EMBEDDING_VERSION,
    ids: ["raw-a"],
  },
});
if (mapAfterRaw.phase !== "map" || mapAfterRaw.files.length !== 2) {
  throw new Error("Document-map enrichment must begin only after raw archive coverage");
}

console.log("PASS: incremental multilingual ingestion contract");
