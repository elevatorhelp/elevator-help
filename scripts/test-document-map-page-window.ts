import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOrderedDocumentMapPageWindow, validatedDocumentMapNodePageRange, hasValidStagedDocumentMapIdentity, hasValidDocumentMapMetadata, dedupeDocumentMapNodes, documentMapNodeIdentityParts } from "../app/lib/document-map-page-window.ts";

test("accepts ordered physical pages, including legitimate gaps after empty-page filtering", () => {
  assert.equal(isOrderedDocumentMapPageWindow([{ page: 1, text: "one" }, { page: 2, text: "two" }]), true);
  assert.equal(isOrderedDocumentMapPageWindow([{ page: 7, text: "seven" }, { page: 10, text: "ten" }]), true);
});

test("rejects reversed or duplicated pages that corrupt document-map window bounds", () => {
  assert.equal(isOrderedDocumentMapPageWindow([{ page: 2, text: "two" }, { page: 1, text: "one" }]), false);
  assert.equal(isOrderedDocumentMapPageWindow([{ page: 2, text: "two" }, { page: 2, text: "duplicate" }]), false);
  assert.equal(isOrderedDocumentMapPageWindow([{ page: 1, text: "one" }, { page: 3, text: "three" }, { page: 2, text: "two" }]), false);
});

test("rejects nonphysical or malformed page anchors", () => {
  for (const invalid of [[], null, "pages", [{ page: 0, text: "zero" }], [{ page: -1, text: "negative" }], [{ page: 1.5, text: "fractional" }], [{ page: Number.MAX_SAFE_INTEGER + 1, text: "unsafe" }], [{ page: "1", text: "string" }], [{ page: 1, text: null }], [null]]) {
    assert.equal(isOrderedDocumentMapPageWindow(invalid), false, JSON.stringify(invalid));
  }
});


test("accepts only generated map ranges fully backed by supplied physical pages", () => {
  const contiguous = [{ page: 79, text: "clause" }, { page: 80, text: "continuation" }];
  assert.deepEqual(validatedDocumentMapNodePageRange(79, 80, contiguous), { pageStart: 79, pageEnd: 80 });
  assert.deepEqual(validatedDocumentMapNodePageRange(80, 80, contiguous), { pageStart: 80, pageEnd: 80 });
  const sparse = [{ page: 7, text: "seven" }, { page: 10, text: "ten" }];
  assert.deepEqual(validatedDocumentMapNodePageRange(7, 7, sparse), { pageStart: 7, pageEnd: 7 });
  assert.deepEqual(validatedDocumentMapNodePageRange(10, 10, sparse), { pageStart: 10, pageEnd: 10 });
});

test("rejects hallucinated, clamped, missing and unprovided pages", () => {
  const pages = [{ page: 7, text: "seven" }, { page: 10, text: "ten" }];
  for (const [start, end] of [[8, 8], [7, 8], [7, 10], [0, 7], [-1, 7], [7, 11], [10, 7], ["7", 7], [null, 7], [7, 7.5], [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1]]) {
    assert.equal(validatedDocumentMapNodePageRange(start, end, pages), null, `${start}-${end}`);
  }
  assert.equal(validatedDocumentMapNodePageRange(7, 7, [{ page: 10, text: "ten" }, { page: 7, text: "seven" }]), null);
});

test("document-map route applies the page-range validator to generated nodes", () => {
  const route = readFileSync(new URL("../app/api/document-map-ingest/route.ts", import.meta.url), "utf8");
  assert.match(route, /validatedDocumentMapNodePageRange\(item\.pageStart,\s*item\.pageEnd,\s*pages\)/);
  assert.match(route, /if \(!range\) return null;/);
  assert.doesNotMatch(route, /clampPage\(/);
});


test("staged map rejects unreceiptable source revisions before embedding", () => {
  const lease = { jobKey: "doc-1", generation: 2 };
  const valid = { sourceFileId: "doc-1", sourceFingerprint: "revision-a" };
  assert.equal(hasValidStagedDocumentMapIdentity(valid, lease), true);
  for (const document of [
    { ...valid, sourceFingerprint: " " },
    { ...valid, sourceFingerprint: "x".repeat(513) },
    { ...valid, sourceFingerprint: "" },
    { ...valid, sourceFingerprint: null },
    { ...valid, sourceFileId: "other-document" },
    null,
  ]) assert.equal(hasValidStagedDocumentMapIdentity(document, lease), false);
  assert.equal(hasValidStagedDocumentMapIdentity(valid, null), false);
  assert.equal(hasValidStagedDocumentMapIdentity(valid, { jobKey: "doc-1", generation: 0 }), false);
});

test("actual document-map HTTP path rejects bad revisions before paid calls", () => {
  const route = readFileSync(new URL("../app/api/document-map-ingest/route.ts", import.meta.url), "utf8");
  const guard = route.indexOf("hasValidStagedDocumentMapIdentity(document,lease)");
  const paid = route.indexOf("const geminiBudget = createGeminiCallBudget(");
  assert.ok(guard >= 0 && paid > guard, "staged revision guard must run before Gemini/embedding");
  assert.match(route, /INVALID_STAGED_MAP_LEASE/);
});

test("deduplicates model-generated map nodes by exact stable vector identity", () => {
  const first = {
    nodeType: "standard-clause", sectionId: "5.4.7.4", parentSection: null,
    title: "Guardrail", topics: ["roof"], summary: "Same grounded requirement",
    pageStart: 7, pageEnd: 7,
  };
  const duplicate = { ...first, topics: ["safety"], parentSection: "5.4.7" };
  const nextPage = { ...first, pageStart: 8, pageEnd: 8 };
  const nextClause = { ...first, sectionId: "5.4.7.5" };
  const nextSummary = { ...first, summary: "Different grounded requirement" };
  const result = dedupeDocumentMapNodes([first, duplicate, nextPage, nextClause, nextSummary]);
  assert.equal(result.length, 4);
  assert.strictEqual(result[0], first, "retain first node and its source topics");
  assert.deepEqual(result.slice(1), [nextPage, nextClause, nextSummary]);
  assert.deepEqual(documentMapNodeIdentityParts(first), [
    "7", "7", "standard-clause", "5.4.7.4", "Guardrail", "Same grounded requirement",
  ]);
});

test("document-map route deduplicates before paid embedding and uses same stable ID parts", () => {
  const route = readFileSync(new URL("../app/api/document-map-ingest/route.ts", import.meta.url), "utf8");
  const dedupe = route.indexOf("const nodes = dedupeDocumentMapNodes(await analyzeDocumentWindow(");
  const paid = route.indexOf("const embeddingResult = await ai.run(");
  assert.ok(dedupe >= 0 && paid > dedupe, "deduplicate before dual embedding calls");
  assert.match(route, /\.\.\.documentMapNodeIdentityParts\(node\)/);
  assert.match(route, /recordStagedMap\(/);
});


test("rejects malformed optional map metadata and unsafe versions before paid work", () => {
  const valid = { sourceFileId: "doc-1", fileName: "test.pdf", sourcePath: "qa/test.pdf" };
  assert.equal(hasValidDocumentMapMetadata(valid), true);
  assert.equal(hasValidDocumentMapMetadata({
    ...valid, mapVersion: 2, modifiedTime: "2026-10-29T00:00:00Z",
    sourceFingerprint: "revision-a", languageHint: "de", documentGroupHint: "EN 81-20",
  }), true);
  assert.equal(hasValidDocumentMapMetadata({ ...valid, mapVersion: null, languageHint: null }), true);
  for (const invalid of [
    { ...valid, mapVersion: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, mapVersion: -1 },
    { ...valid, mapVersion: 0 },
    { ...valid, mapVersion: 1.5 },
    { ...valid, mapVersion: "1" },
    { ...valid, modifiedTime: { timestamp: "now" } },
    { ...valid, sourceFingerprint: { value: "revision" } },
    { ...valid, languageHint: ["de"] },
    { ...valid, documentGroupHint: { group: "standard" } },
    { ...valid, documentGroupHint: true },
    null,
    [],
  ]) assert.equal(hasValidDocumentMapMetadata(invalid), false, JSON.stringify(invalid));
});

test("real map route validates optional metadata before Gemini and Vectorize", () => {
  const route = readFileSync(new URL("../app/api/document-map-ingest/route.ts", import.meta.url), "utf8");
  const guard = route.indexOf("hasValidDocumentMapMetadata(document)");
  const gemini = route.indexOf("const geminiBudget = createGeminiCallBudget(");
  const embedding = route.indexOf("const embeddingResult = await ai.run(");
  const upsert = route.indexOf("await guardWrite(() => vectorize.upsert(");
  assert.ok(guard >= 0 && gemini > guard && embedding > guard && upsert > guard,
    "malformed optional metadata must be rejected before all paid work and writes");
  assert.ok(route.includes("Number.isSafeInteger(document.mapVersion)"));
});
