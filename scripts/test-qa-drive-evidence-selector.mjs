import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { activeEvidenceQuery, selectQueryableEvidence } from "./qa-drive-evidence-selector.mjs";

const fileId = "DrivePilot_2026_ABC";
const extract = label => /^[A-Z]\d{3}$/.test(label) ? [{ key: label }] : [];
const row = (page, chunk_id, identifiers_json) => ({ page, chunk_id, identifiers_json });
const valid = JSON.stringify([{ label: "E123", key: "E123" }]);
const invalid = JSON.stringify([{ label: "not a code", key: "MISMATCH" }]);

test("later active page with a queryable identifier is selected", () => {
  const selected = selectQueryableEvidence([row(1, "first", "[]"), row(2, "second", valid)], extract);
  assert.equal(selected?.record.chunk_id, "second");
  assert.equal(selected?.record.page, 2);
  assert.equal(selected?.candidate.label, "E123");
});
test("first valid chunk is retained", () => {
  assert.equal(selectQueryableEvidence([row(1, "first", valid), row(2, "second", valid)], extract)?.record.chunk_id, "first");
});
test("unqueryable identifiers are skipped, never treated as proof", () => {
  assert.equal(selectQueryableEvidence([row(1, "bad", invalid), row(2, "good", valid)], extract)?.record.chunk_id, "good");
  assert.equal(selectQueryableEvidence([row(1, "bad", invalid)], extract), null);
});
test("published exact evidence must have a positive safe physical PDF page", () => {
  for (const page of [0, -1, null, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => selectQueryableEvidence([row(page, "bad-page", valid)], extract),
      /QA_INVALID_EVIDENCE_PAGE/,
      "must reject invalid source page: " + String(page),
    );
  }
  assert.equal(selectQueryableEvidence([row(1, "good", valid)], extract)?.record.page, 1);
  // A corrupt active row must not be skipped to manufacture a green QA result.
  assert.throws(
    () => selectQueryableEvidence([row(0, "bad", valid), row(2, "good", valid)], extract),
    /QA_INVALID_EVIDENCE_PAGE/,
  );
});
test("malformed JSON fails closed instead of silently passing", () => {
  assert.throws(() => selectQueryableEvidence([row(1, "bad", "{")], extract), SyntaxError);
  assert.throws(() => selectQueryableEvidence([row(1, "bad", "{}")], extract), /QA_INVALID_EVIDENCE_IDENTIFIERS/);
});
test("file ID cannot inject SQL", () => {
  assert.throws(() => activeEvidenceQuery("x';DROP TABLE x;--"), /QA_INVALID_TARGET_FILE_ID/);
  assert.throws(() => activeEvidenceQuery("short"), /QA_INVALID_TARGET_FILE_ID/);
});
test("SQLite active generation join excludes valid identifiers from old generations", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE ingestion_staged_evidence (document_id TEXT, generation INTEGER, chunk_id TEXT, identifiers_json TEXT, page INTEGER)");
    db.exec("CREATE TABLE ingestion_document_publications (document_id TEXT, active_generation INTEGER)");
    db.prepare("INSERT INTO ingestion_document_publications VALUES (?,?)").run(fileId, 2);
    const insert = db.prepare("INSERT INTO ingestion_staged_evidence VALUES (?,?,?,?,?)");
    insert.run(fileId, 1, "old", valid, 1);
    insert.run(fileId, 2, "active-empty", "[]", 1);
    insert.run(fileId, 2, "active-second", valid, 2);
    const rows = db.prepare(activeEvidenceQuery(fileId)).all();
    assert.deepEqual(rows.map(r => r.chunk_id), ["active-empty", "active-second"]);
    assert.equal(selectQueryableEvidence(rows, extract)?.record.chunk_id, "active-second");
    db.exec("UPDATE ingestion_document_publications SET active_generation=3");
    assert.equal(db.prepare(activeEvidenceQuery(fileId)).all().length, 0);
  } finally { db.close(); }
});
