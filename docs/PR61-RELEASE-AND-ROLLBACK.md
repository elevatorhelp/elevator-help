# PR61 release safety and rollback — controlled runbook

**Status: NOT APPROVED FOR PRODUCTION.** The original PR61 and integration PR63 are Draft. This document is a reviewable recovery procedure; writing it does not demonstrate successful remote restore.

## Gate A — authenticated customer answer

Use a production-equivalent isolated application with real Clerk authentication enabled and a legitimate test account/session. Never disable `AUTH_REQUIRED` for the positive test and never paste session tokens into issues, logs, Action inputs or this roadmap.

1. Assert missing token -> HTTP 401, malformed/expired token -> HTTP 401, valid token -> permitted as the correct test account. Test via the actual `/api/ask` endpoint, **not** via `/api/qa-evidence-lookup`.
2. Ingest an explicitly approved known-source PDF into isolated QA; verify its current document identity, fingerprint, edition, page and clause in D1.
3. Ask one technical question through the authenticated chat route. Verify the actual answer, source citation/page, correct manufacturer/model context and absence of secret paths, private text leakage, or unsupported normative conclusions. Reject any unstated source claims.
4. Negative test: no published generation, wrong revision, bad/missing citation or stale lease must not create a verified assertion.
5. Record only sanitized response evidence and exact worker, application and commit identity.

**Important:** The disposable ingestion-only QA Worker deliberately denies `/api/ask`; do NOT weaken its endpoint allowlist to satisfy this gate. The real positive test requires a separately reviewed Clerk-configured endpoint and a legitimate session.

## Gate B — consistent recovery prerequisites

Before any migration or activation, capture the exact main commit, current Worker deployment ID, migration version and D1 database ID, Vectorize index name/configuration, per-document active generation and revision, all three Evidence/RAW/Map counters, ingestion cursors, leases, queue state, quotas and per-file manifest fingerprints. Ensure a recoverable immutable D1 snapshot or Time Travel bookmark and verify its restore **on a disposable isolated database**. Verify a durable archive source replay path and vector manifest reconstruction for that same database snapshot. A D1 bookmark alone cannot restore Vectorize; vectors and D1 publication state must be reconciled before serving citations.

Maintain a change freeze for ingestion while taking the consistent checkpoint. Reject unknown/mixed generation data rather than silently promoting it.

## Gate C — controlled activation

Only after exact-head Build Check, independent security review, reversible migrations, real multi-page crash-resume, customer auth/citation and disposable full restore are green:
- Preserve previous Worker version and environment values.
- Use existing serial ingestion; lease/adaptive parallel mode remains OFF until separate tested concurrency evidence.
- Apply reviewed additive migrations only after successful consistent backup and rollback rehearsal.
- Roll out one controlled QA/preview environment, run authentication and citation smoke, then owner-approved Production canary.
- Measure active generations, stale-worker fencing, RAW/Evidence/Map vectors, Gemini cost, error counts and retrieval fidelity. Halt on any discrepancy.

## Gate D — rollback and reconciliation

1. Pause ingestion and disable new adaptive/parallel feature flags; never stop serving already verified published generations unnecessarily.
2. Revert to the last known good Worker deployment and previous compatible feature flags through the authorized release tooling. Do not force-push or rewrite repository history.
3. **If schema/data restore is necessary**, first confirm backup bookmark belongs to the correct database and time; obtain explicit release-owner approval for Production D1 restore. Rehearse on disposable D1, compare integrity, foreign keys, active-generation manifests and document counts. Production restore is not an automatic QA step.
4. Rebuild/reconcile affected Vectorize generations against the restored D1 active-publication manifest and source fingerprints before re-enabling evidenced answers. Do not blindly delete vector data or expose unpublished generations. Reindex deterministically from the approved source archive as needed.
5. Validate a representative authenticated exact-citation answer, stale-owner refusal, partial-batch resume, language/version routing and quotas; restore scheduler only after parity is proven.
6. Record all changed IDs, source SHA/run URLs, observed counts, unresolved mismatches and explicit sign-off in ROADMAP.md.

## Required release evidence (not yet complete)

- [ ] Exact-head full CI PASS on final PR stack after review.
- [ ] True Clerk-authenticated customer `/api/ask` with correct page citation.
- [ ] Disposable D1 **full-state** backup and actual restore plus Vectorize manifest reconciliation.
- [ ] Stale-worker and bounded multi-writer/cloud-cost gate.
- [ ] Independent security and deployment/rollback approvals.
- [ ] Owner release approval; only then merge the reviewed PR chain in dependency order.

Existing offline SQL snapshot/restore tests and the earlier one-row isolated Cloudflare D1 Time Travel restore are *partial supporting evidence*, not completion of Gate B or D.
