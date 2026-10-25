# PR61/Issue60 — cross-clause attribution QA, 2026-10-25

Baseline: `5d7af53426396b46b60d6a8e57f67d214f503f6c` (stacked Draft PR70 on PR63). Scope: only standards claim verifier, its synthetic regression and ROADMAP. Production unchanged.

## Reproduced defect

The verifier required the copied quote and the claimed clause identifier to occur anywhere in the same retrieved evidence chunk, not the same clause section. With a two-clause synthetic source, model claim for 7.1 quoting 7.2 was incorrectly accepted in semantic and exact paths (2 failed assertions before fix). No real EN81-20 requirement was used.

## Fix and verification

Added a conservative section-location guard: prefer line-start clause headings across different roots, otherwise use same-root inline clause markers to avoid confusing measurements (0.70 m/1.10 m) with headings. Quote must be inside the claimed section. Missing/ambiguous markers fail closed. Eight cross-clause scenarios (semantic/exact, same/different root, valid/invalid) were added to the 64-page provenance cases. 72/72 PASS. Topic retrieval including source page and private-path exclusion PASS; clause-boundary regression PASS; Cortex budget PASS; local SQL restore PASS; request-auth mock and installed-SDK auth PASS; TypeScript and static security PASS. Local Next/OpenNext bundle validation to be recorded separately; Windows local checks do not substitute for exact-head Ubuntu CI.

## Limitations and release gates

This conservative textual segmentation is not a complete semantic proof. Single-line different-root headings without clear punctuation may not be distinguished from decimal quantities; unrecognized heading formats fail closed only when no usable matching marker exists. Cross-references may cause extra rejection. Edition/fingerprint/source identity, printed vs physical page, active publication generation and actual signed-in Clerk customer answer remain unverified. Remote isolated D1 + both Vectorize restore/replay, real bounded concurrency/cost and rollback, independent review, exact-head CI, stack reconciliation and owner production authorization are still mandatory. No merge, deployment, production mutation or Issue60 closure.

Final Windows Node24 offline verification at baseline 5d7af534: all ten commands PASS (0 failures), including 72/72 source-page+cross-clause scenarios, topic citation, clause boundary, mocked auth contract, local SQL restore, installed-SDK auth, static security, TypeScript, Next webpack build and OpenNext Cloudflare bundle. Raw command/exit evidence is retained locally in PR61-FINAL-LOCAL-2026-10-25.log (not committed because logs can contain environment details). This is not Linux Node22 CI or real customer/cloud proof.
