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

const renamed = {id:'same-drive-id', name:'EN_81-71_DE.pdf', sourcePath:'Standards/EN_81-71_DE.pdf', md5Checksum:'same-content'};
const original = {name:'EN_81-71.pdf', sourcePath:'Standards/EN_81-71.pdf', evidenceFingerprint:'same-content',
  archiveIndexVersion: ARCHIVE_INDEX_VERSION, evidenceIds:['chunk'], rawFingerprint:'same-content',
  rawEmbeddingVersion: RAW_EMBEDDING_VERSION, ids:['chunk'], mapFingerprint:'same-content',
  mapVersion: DOCUMENT_MAP_VERSION, mapIds:['map']};
if (createIngestionPlan([renamed], {'same-drive-id':original}).phase !== 'evidence') {
  throw new Error('Rename must refresh citations despite identical content fingerprint');
}
if (createIngestionPlan([renamed], {'same-drive-id':{...original,name:renamed.name,sourcePath:renamed.sourcePath,metadataRefreshPendingRaw:true}}).phase !== 'raw') {
  throw new Error('Rename must refresh semantic metadata after exact evidence');
}
if (createIngestionPlan([renamed], {'same-drive-id':{...original,name:renamed.name,sourcePath:renamed.sourcePath,metadataRefreshPendingMap:true}}).phase !== 'map') {
  throw new Error('Rename must refresh document-map metadata after raw vectors');
}
// A live evidence backlog must not block semantic/map work on already prepared files.
const phaseFiles = [
  { id: 'new', name: 'new.pdf', sourcePath: 'a/new.pdf', md5Checksum: 'n' },
  { id: 'vector', name: 'vector.pdf', sourcePath: 'b/vector.pdf', md5Checksum: 'v' },
  { id: 'mapped', name: 'mapped.pdf', sourcePath: 'c/mapped.pdf', md5Checksum: 'm' },
];
const phaseRecords = {
  vector: { evidenceFingerprint: 'v', archiveIndexVersion: ARCHIVE_INDEX_VERSION, evidenceIds: ['ev'] },
  mapped: { evidenceFingerprint: 'm', archiveIndexVersion: ARCHIVE_INDEX_VERSION, evidenceIds: ['em'], rawFingerprint: 'm', rawEmbeddingVersion: RAW_EMBEDDING_VERSION, ids: ['vm'] },
};
for (const [preference, expectedId] of [['evidence', 'new'], ['raw', 'vector'], ['map', 'mapped']]) {
  const plan = createIngestionPlan(phaseFiles, phaseRecords, false, preference);
  if (plan.files[0]?.id !== expectedId || plan.phase !== preference) {
    throw new Error(`Phase fairness failed for ${preference}: ${plan.phase}/${plan.files[0]?.id}`);
  }
}
const unsafeMap = createIngestionPlan(phaseFiles, {}, false, 'map');
if (unsafeMap.phase !== 'evidence') throw new Error('Map must not bypass per-document prerequisites');
console.log("PASS: incremental multilingual ingestion, phase fairness and rename/move metadata refresh");

// Stress-test the scheduler against a perpetually replenished Evidence queue.
// Existing raw/map-ready documents must still receive turns as priority rotates.
const stressFiles = [
  { id: "raw-ready", name: "raw.pdf", sourcePath: "b/raw.pdf", md5Checksum: "r" },
  { id: "map-ready", name: "map.pdf", sourcePath: "c/map.pdf", md5Checksum: "m" },
];
const stressRecords = {
  "raw-ready": { evidenceFingerprint: "r", archiveIndexVersion: ARCHIVE_INDEX_VERSION, evidenceIds: ["er"] },
  "map-ready": { evidenceFingerprint: "m", archiveIndexVersion: ARCHIVE_INDEX_VERSION, evidenceIds: ["em"], rawFingerprint: "m", rawEmbeddingVersion: RAW_EMBEDDING_VERSION, ids: ["rm"] },
};
const observed = new Set();
for (let cycle = 0; cycle < 18; cycle++) {
  const incoming = { id: `new-${cycle}`, name: `new-${cycle}.pdf`, sourcePath: `a/new-${cycle}.pdf`, md5Checksum: `n-${cycle}` };
  const preferred = ["evidence", "raw", "map"][cycle % 3];
  const plan = createIngestionPlan([incoming, ...stressFiles], stressRecords, false, preferred);
  observed.add(plan.phase);
  if (plan.phase !== preferred) throw new Error(`Live backlog fairness: expected ${preferred}, got ${plan.phase}`);
}
if (observed.size !== 3) throw new Error("A continuously growing evidence backlog starved a processing phase");
// The six-hour UTC rotation is independent of each scheduled run's phase.
// A non-divisor schedule may repeat phases, so validate the actual 3/9/15/21 UTC cadence.
const scheduledHours = [3, 9, 15, 21];
const scheduledPhases = scheduledHours.map(hour => ["evidence", "raw", "map"][Math.floor(hour / 6) % 3]);
if (new Set(scheduledPhases).size !== 3) throw new Error("Scheduled runs do not cover all phases");
console.log("PASS: live backlog stress and scheduled phase rotation");
