import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOrderedDocumentMapPageWindow, validatedDocumentMapNodePageRange } from "../app/lib/document-map-page-window.ts";

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
