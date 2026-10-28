import assert from "node:assert/strict";
import test from "node:test";
import { isOrderedDocumentMapPageWindow } from "../app/lib/document-map-page-window.ts";

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
