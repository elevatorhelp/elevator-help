# Issue #99 — Real Drive immutable V2 runner: QA integration gates

Status: **real isolated Cloudflare V2 HTTP + two-page synthetic PDF proof PASS; real Google Drive full-runner E2E and Production activation NO-GO**.

## Implemented in PR #100

- New `INGESTION_V2_QA_MODE=true` opt-in runner mode. No schedules or production feature flags enabled.
- A manual GitHub Actions dispatch, D1 strict coordinator, exact run ID, bounded `MAX_FILES` (1–2) and `MAX_GEMINI_CALLS` (1–12), isolated loopback or QA-only Worker origin, four same-origin endpoints and a separate QA Drive root are mandatory. The default Production Drive root is rejected.
- The **existing** Google Drive PDF extraction, chunk IDs, exact Evidence source, RAW Workers AI + Gemini embeddings and Gemini document-map analysis feed the immutable staging primitives with a **durable document epoch**. Physical RAW/Map IDs returned from fenced dual-index readback are checkpointed separately in `scope.v2Files`; legacy `scope.files` stays unchanged.
- Source revision fingerprints include the Drive MD5, filename/path and archive embedding/map/evidence versions. Every downloaded QA PDF must match the Drive MD5 metadata. Missing/changed source is fail-closed.
- A document can publish only after all three matching source-fingerprint layers are complete: Evidence, RAW, Map; all Map/RAW IDs must encode the current physical epoch. A PDF with suspicious/empty text layer is never automatically published. D1 CAS private publish is already owner and epoch-fenced.
- No legacy unversioned deletion in V2 mode. Two missing scans mark a **tombstone candidate only**; they do not claim a completed deletion or remove any published evidence.
- A missing local evictable cache in QA is acceptable only when **an existing, validated authoritative D1 snapshot** is present. No silent zero-state bootstrap.

## Bounded offline evidence

The dedicated `qa-drive-v2-runner.yml` workflow tests fail-closed origin/root/quotas, stale physical epoch, receipt identity, manifest completeness and regression of the serial runner. The previous PR #98 [physical dual QA index proof](https://github.com/elevatorhelp/elevator-help/actions/runs/42702123236) checks both indexes but **does not** prove this new real PDF pipeline.

## Remote QA preflight before dispatch

1. Provision **a distinct, owner-reviewed synthetic/public QA PDF folder**, never use the customer/private Drive archive. Record its QA root ID in the environment; provide a dedicated TEST Google service account restricted to that folder.
2. Use only isolated QA Cloudflare D1 and the two test Vectorize indexes `elevator-help-staging-test` / `elevator-help-staging-test-v2`. Ensure the isolated Worker binds those resources, has migration tables from the four additive schema documents, and the generic published-read gate enabled. Production indexes/bindings/host must not be used.
3. Pre-create and verify a nonempty root-scoped durable D1 checkpoint from the reviewed QA source. Current strict QA runner **refuses** absent coordinator state and never bootstraps. Reconcile D1 backup/restore and branch rollback.
4. Create an **explicit one-off** manual QA workflow that launches the isolated remote Worker, injects bounded short-lived QA credentials, supplies consistent `INGESTION_V2_QA_ORIGIN`, all four endpoint URLs and `INGESTION_V2_QA_DRIVE_ROOT`, and keeps paid Gemini calls within the reviewed cap. No deployment, new schedule, automatic paid call, or migration is performed by this PR.
5. Test a real, non-private multipage PDF through Evidence → RAW → Map → D1 publication; assert exact page/clause citation via authenticated /api/ask. Test interrupted resumes, wrong source revision, missing Map, late owner writes, deletion tombstones, backups and rollback; retain sanitized QA artifacts.

## Explicit NO-GO gaps

- **Real source PDF HTTP route to isolated Cloudflare/D1/Vectorize has NOT passed end-to-end.**
- Actual authenticated `/api/ask` source citation after full V2 publication remains unverified.
- V2 tombstone `published` transition/deletion and vector garbage-collection lifecycle have **not** been implemented.
- Root D1 checkpoint JSON is limited to 1.25 MB; corpus-scale storage needs measured capacity and likely per-document checkpoint separation.
- Two permanent independent writers still require per-shard owner fencing/coordination and a shared Gemini budget.
- No Production D1 migration/backup/restore, no V2 feature flags or Worker deploy, no scheduled second indexer, no Production rollback proof.

**Release decision:** do not enable on Production. PR #100 must remain Draft until complete remote QA evidence and review.

## Verified physical HTTP evidence — 2026-11-09

- Initial [real Cloudflare run #42707998201](https://github.com/elevatorhelp/elevator-help/actions/runs/42707998201) identified an actual production-code defect: two Vectorize indexes physically returned matching RAW and Map vectors, but final D1 manifest rejected publication. Root cause: the manifest correctly carried **physical staged V2 IDs**, while D1 validation compared them to `logical_id`. The root cause was fixed in PR #100, and all immutable / document-epoch / exact evidence unit tests were migrated to use verified physical IDs.
- Corrected [real isolated Worker run #42709223590](https://github.com/elevatorhelp/elevator-help/actions/runs/42709223590): **SUCCESS**. The generated original 2-page PDF was parsed by the same `unpdf` parser used by the Drive runner; both source pages were staged as exact Evidence. Both 768-dimensional RAW page vectors and a two-page Map were inserted and independently read back through **both real Cloudflare QA Vectorize indexes**. Incomplete publication blocked; full D1 3-layer publish succeeded; exact manifest was re-attested; duplicate commit and released-lease stale publish were rejected. No Google access, private PDF, Gemini call, Production migration, scheduled indexer, or Production deployment.
- [Durable sanitized QA artifact](https://github.com/elevatorhelp/elevator-help/actions/runs/42709223590/artifacts/13715831694) retained 30 days.
- Explicit limitation: synthetic physical HTTP staging exercises actual Worker routes and exact PDF extraction, **not** the authenticated Google Drive fetch/token/metadata/cursor path, Gemini-generated RAW/Map vectors, signed-in /api/ask answers, full archive indexer restart or two independent parallel workers.

## Code integration vs release

- A green Build and complete isolated synthetic PDF HTTP proof allow a **code-only merge behind disabled-by-default V2 flags**, provided exact-head CI remains green. This is not an authorization to deploy or enable V2 on Production.
- Keep [Issue #99](https://github.com/elevatorhelp/elevator-help/issues/99) open for a separate owner-reviewed Drive QA fixture (dedicated test-only folder + authorized service account), manual bounded ingestion, authenticated real source-page citation, D1 backup/restore, deletion tombstone publication, per-document durable checkpoint scale, production rollback and two-worker coordination.
- The current serial scheduled ingestion path remains the only allowed Production writer until those gates pass.
