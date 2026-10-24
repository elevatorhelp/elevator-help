# Manual CI and isolated QA handoff — 2026-10-24

Status: PREPARED ONLY. No dispatch, remote mutation, paid calls or release approval.

## CI admission

Review and authorize publication of the local patch separately. The approved SHA must
be the new commit containing the workflow, runner, guard and tests, not the current
unchanged base SHA. Dispatch on a branch/tag resolving to that same approved SHA.
Input is a full lowercase 40-character SHA; mismatch or malformed input fails before
checkout. Actual checkout is independently compared afterward.

The job uses Ubuntu 24.04, Node 22, immutable action pins already used by this repo,
read-only contents permission, no persisted checkout credential, no environment or
service secrets, no cache, fixed concurrency and a 30-minute timeout. No deployment
command or positive Gemini test is included. Installation is npm ci with lifecycle
scripts disabled; this reduces install execution and must prove sufficient on Linux.
OpenNext builds the locked Next/adapter pair through npm run cf:build; it may fail.
Do not silently upgrade dependencies or enable install scripts to obtain green CI.
Audit is required and fails on advisory threshold or registry failure.

GitHub documents workflow_dispatch availability on the default branch and write access:
https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
Default-branch workflow registration, repository Actions policy, allowed action pins,
runner availability and current PR heads are not verified. Do not work around missing
registration with a push trigger or merge. Obtain owner approval for the CI hosting
route (for example a separately approved sandbox repository) first.

After separately authorized publication and registration, the owner can dispatch:

    gh workflow run qa-pr63-exact-head-build.yml --repo OWNER/REPO --ref REVIEWED_BRANCH -f approved_sha=FULL_REVIEWED_SHA

This is a template, not an executed command. Preserve run URL, workflow SHA,
head SHA, Node/npm versions, install/build/audit logs and per-test result JSON.
Check PR63 and PR69 head SHA, base SHA, draft state, conflicts and required checks
using an authorized GitHub read channel before choosing integration order.
Local cached refs are insufficient. No credential discovery or auth-status command
is necessary to establish that limitation.

## Live QA admission (separate authorization required)

Require a named owner, exact candidate SHA, dedicated isolated account/resources,
scoped credentials supplied through an approved secret mechanism, fixture rights,
maximum requests/tokens/currency/time, stop thresholds, cleanup owner and checkpoint.
Confirm D1 IDs, both Vectorize indices, Worker routes and Clerk audience against
production inventory without logging secret values. Existing QA workflows are not
automatically safe to dispatch: sibling push triggers/secret-presence paid selection
remain, some install adapter 1.20.12 instead of shipped 1.20.10, and restore is D1-only.
Review a pinned workflow and every called script before authorization.

1. **Signed customer path.** Use a legitimate isolated Clerk test session with
   AUTH_REQUIRED=true on the actual /api/ask endpoint. Use the existing
   scripts/qa-authenticated-ask-citation.mjs only as a starting harness. Missing and
   malformed tokens must return 401; add a genuine expired-token check and independent
   account/tenant verification. A valid session must yield 200 and standards_verified.
   Its current substring/page-pattern checks do not prove edition/clause/page truth.
   Independently compare original approved PDF edition/version, exact clause text,
   positive PDF page, fingerprint and D1 active generation with sanitized response
   evidence. Wrong edition, missing publication, invented page, private path or
   unsupported claim fails. Never use QA evidence lookup as customer auth proof.
2. **Positive publication and readback.** Explicit paid opt-in and confirmed budget
   are both prerequisites. Record actual returned RAW/Evidence/Map IDs, exact
   manifest sets (not counts alone), generation, source fingerprint and D1 publication.
   In a separate reader/process query both approved QA indices after bounded delays
   (proposed 2, 5, 10, 20, 40 seconds; owner must approve limits).
   Compare IDs/metadata and semantic retrieval against active D1 manifests.
   Exhaustion is failure/inconclusive, never success; writes accepted by Vectorize
   are not readback evidence. Record calls, tokens, actual cost and latency samples;
   report sample size before p50/p95.
3. **Drive crash/resume.** Select an approved real multilingual multipage PDF that
   creates at least two RAW batches. Existing multipage workflow and drive-ingest
   controlled interruption hook are reusable, but historical file IDs are not general
   acceptance fixtures. Interrupt only after durable first RAW receipt; preserve
   checkpoint, resume same generation, prove lease renewal/takeover and stale-worker
   rejection. Publication requires exact three-layer manifests. Exercise missing,
   duplicate, altered and cross-document receipts. Verify updates, rename/delete,
   deduplication, unseen documents, conflicting editions and cache/index invalidation.
4. **Restore/reconcile.** Freeze isolated ingestion, record D1 snapshot/bookmark,
   source replay inputs, schemas, fingerprints, leases, cursors, active generations
   and vector manifests for both indices. Restore onto disposable D1 only; reconcile
   vectors against the same checkpoint before exposing answers. Compare complete
   manifest sets and metadata, exact/semantic retrieval, stale-generation invisibility,
   replay and rollback. A one-row or SQLite/D1-only restore cannot pass this gate.
   No blind vector deletion; stop on any mixed generation or unexplained mismatch.

For every stage retain sanitized evidence, timestamps, resource identities and SHA;
record PASS only after actual execution and independent comparison. Stop on unsafe
credentials, missing authorization, budget overrun, source uncertainty or parity loss.
Release/rollback authority remains docs/PR61-RELEASE-AND-ROLLBACK.md; production
restore, merge, deployment and release each remain outside this task.
