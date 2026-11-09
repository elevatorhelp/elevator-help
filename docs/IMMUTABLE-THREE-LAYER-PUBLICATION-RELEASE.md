# Three-layer immutable publication — release gate

Status: **QA-only primitive. Disabled and not integrated into Production.**
This implementation is industry/standard-agnostic. Never expose unpublished
staging data through a legacy retrieval route. The existing single scheduled
indexer and owner's signed-in Admin Monitoring are unaffected.

## What is implemented
- Generation-qualified Vectorize identifiers use SHA-256 and are at most
  **64 bytes** (Cloudflare Vectorize documented limit). Generation, root,
  document ID, layer, source fingerprint and logical chunk ID are covered.
- Use `insert()` (first vector wins for a given immutable ID), NOT
  `upsert()` against live unversioned IDs. Each new fencing generation has
  a different physical ID; a delayed old worker can leave orphan staged
  vectors but cannot overwrite the newly published generation.
- Check `getByIds()` from **both** physical Vectorize indexes, verifying
  exact ID, positive page, source file, fingerprint, status, layer and
  content type before creating a durable D1 receipt.
- D1 staged Evidence stores exact text, page and source anchor per
  generation, and rejects conflicting same-generation rewrites.
- **One D1 SQLite statement** atomically checks current root lease
  owner/generation and **exact complete manifests** for RAW, Evidence,
  Map (including counts, full logical IDs and source fingerprint) before
  advancing the per-document published generation. Partial three-layer
  publication is forbidden; stale worker takeover cannot republish.
- Reader primitives explicitly filter Vectorize matches and exact
  Evidence using the D1 published generation, including hiding stale
  generation and superseded legacy vectors.

## QA evidence
- Local two-connection SQLite test: complete 3-layer CAS, missing/malformed
  manifests rejected, source revision mismatch, immutable Evidence
  tampering, old/new generation visibility, stale-owner late external
  insert not creating a receipt, checksum/ID bounds; all PASS.
- Cloudflare QA-only D1 `elevator-help-coordinator-qa-20261024-c6024b2c`:
  additive migration created/verified three new tables
  `ingestion_v2_vector_receipts`,
  `ingestion_v2_staged_evidence`, `ingestion_v2_publications`.
  Main Production D1 was not changed.
- Verify exact-head Build Check and QA GitHub workflow before merge.

## NOT DONE / activation gates
1. This primitive is not yet wired into the actual
   `drive-ingest-batch` and `document-map-ingest` writers, Google Drive
   runner, or *all* real retrieval entrypoints. Main still has legacy
   Vectorize upsert/delete paths. **Do not turn on parallel writing.**
2. Wire source-fingerprint/manifest and global root lease from the
   GitHub worker; renew lease for long tasks; maintain a D1-authoritative
   crash-resumable checkpoint and exact durable backup.
3. Integrate the generation visibility filter in all citation/retrieval
   routes (semantic, exact D1, map and direct getByIds). Until **all**
   readers are switched, an uncommitted staged vector may appear in
   legacy search results. Ensure citations use published exact Evidence.
4. Migrate existing legacy generation carefully with a fully verified
   QA-only backup/restore, live compatibility and rollback. Reconcile
   partial Evidence/RAW/Map checkpoints and vector manifests.
5. Run actual isolated Cloudflare Vectorize dual-index staging with
   asynchronous readback and delayed stale-network-response tests.
   A local SQLite plus mock Vectorize test is not real Cloudflare
   Vectorize end-to-end evidence.
6. Enforce aggregate Gemini quota and D1/Vectorize costs for **two**
   persistent schedulers; then explicit owner-approved Production
   canary and monitor P95 errors/real archive progress before enabling
   ongoing dual Worker schedule.

No new credentials, secrets, private Drive filenames, literal PDF contents
or bearer tokens should enter GitHub logs or public issue comments.
