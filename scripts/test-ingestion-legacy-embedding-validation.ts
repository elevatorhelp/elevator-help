import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasValidLegacyEmbeddingBatch, LEGACY_BGE_BASE_EN_DIMENSIONS } from "../app/lib/ingestion-legacy-embedding-validation.ts";

const valid = () => Array.from({ length: LEGACY_BGE_BASE_EN_DIMENSIONS }, (_, i) => i === 0 ? 0.5 : 0);

test("accepts a complete finite 768-dimensional Workers AI embedding batch", () => {
  assert.equal(hasValidLegacyEmbeddingBatch([valid()], 1), true);
  assert.equal(hasValidLegacyEmbeddingBatch([valid(), valid()], 2), true);
});

test("rejects malformed or incomplete legacy vectors before any Vectorize write", () => {
  const badVectors: unknown[] = [
    [], null, "bad", {}, [0.5], Array(768).fill(0),
    [...valid().slice(0, 767), Number.NaN],
    [...valid().slice(0, 767), Number.POSITIVE_INFINITY],
    [...valid().slice(0, 767), "0.1"],
    [...valid(), 0.1],
  ];
  for (const bad of badVectors) {
    assert.equal(hasValidLegacyEmbeddingBatch([bad], 1), false, String(bad));
  }
  assert.equal(hasValidLegacyEmbeddingBatch([valid()], 2), false);
  assert.equal(hasValidLegacyEmbeddingBatch([valid(), valid()], 1), false);
  assert.equal(hasValidLegacyEmbeddingBatch([valid()], 0), false);
  assert.equal(hasValidLegacyEmbeddingBatch([valid()], 1.5), false);
  assert.equal(hasValidLegacyEmbeddingBatch(null, 1), false);
});

test("both ingestion HTTP paths validate legacy vectors before the first Vectorize upsert", () => {
  for (const path of ["drive-ingest-batch", "document-map-ingest"]) {
    const route = readFileSync(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8");
    const guard = route.indexOf("hasValidLegacyEmbeddingBatch(embeddings,");
    const write = route.indexOf("await guardWrite(() => vectorize.upsert(legacyVectors))");
    assert.ok(guard > 0 && write > guard, `${path}: validate before first index write`);
    assert.match(route, /import \{ hasValidLegacyEmbeddingBatch \} from "\.\.\/\.\.\/lib\/ingestion-legacy-embedding-validation";/);
  }
});
