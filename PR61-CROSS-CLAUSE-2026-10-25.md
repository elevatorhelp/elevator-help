# PR61/Issue60 — cross-clause attribution QA, 2026-10-25

Baseline: `5d7af53426396b46b60d6a8e57f67d214f503f6c` (stacked Draft PR70 on PR63). Scope: only standards claim verifier, its synthetic regression and ROADMAP. Production unchanged.

## Reproduced defect

The verifier required the copied quote and the claimed clause identifier to occur anywhere in the same retrieved evidence chunk, not the same clause section. With a two-clause synthetic source, model claim for 7.1 quoting 7.2 was incorrectly accepted in semantic and exact paths (2 failed assertions before fix). No real EN81-20 requirement was used.

## Fix and verification

Added a conservative section-location guard: prefer line-start clause headings across different roots, otherwise use same-root inline clause markers to avoid confusing measurements (0.70 m/1.10 m) with headings. Quote must be inside the claimed section. Missing/ambiguous markers fail closed. Eight cross-clause scenarios (semantic/exact, same/different root, valid/invalid) were added to the 64-page provenance cases. 72/72 PASS. Topic retrieval including source page and private-path exclusion PASS; clause-boundary regression PASS; Cortex budget PASS; local SQL restore PASS; request-auth mock and installed-SDK auth PASS; TypeScript and static security PASS. Local Next/OpenNext bundle validation to be recorded separately; Windows local checks do not substitute for exact-head Ubuntu CI.

## Limitations and release gates

This conservative textual segmentation is not a complete semantic proof. Single-line different-root headings without clear punctuation may not be distinguished from decimal quantities; unrecognized heading formats fail closed only when no usable matching marker exists. Cross-references may cause extra rejection. Edition/fingerprint/source identity, printed vs physical page, active publication generation and actual signed-in Clerk customer answer remain unverified. Remote isolated D1 + both Vectorize restore/replay, real bounded concurrency/cost and rollback, independent review, exact-head CI, stack reconciliation and owner production authorization are still mandatory. No merge, deployment, production mutation or Issue60 closure.

Final Windows Node24 offline verification at baseline 5d7af534: all ten commands PASS (0 failures), including 72/72 source-page+cross-clause scenarios, topic citation, clause boundary, mocked auth contract, local SQL restore, installed-SDK auth, static security, TypeScript, Next webpack build and OpenNext Cloudflare bundle. Raw command/exit evidence is retained locally in PR61-FINAL-LOCAL-2026-10-25.log (not committed because logs can contain environment details). This is not Linux Node22 CI or real customer/cloud proof.


## Selective integration - 2026-10-25

Base b37e49748e712919b5285d5c9c473ff75c5e8089; only cherry-pick -x a8aee3cd5fd148a84c23f535443651d6ebada73e. Earlier report describes the original PR70 baseline. Both working-file conflicts resolved: base ROADMAP history retained verbatim, incoming historical evidence appended, verifier guard unchanged, all multilingual page/security assertions retained. **348/348 PASS**: 340 page cases across two unfamiliar synthetic standards, five locales and exact/semantic paths plus eight same/different-root cross-clause cases. Gemini reasoning unchanged.

Existing node_modules, Windows Node v24.19.0, no npm ci. **20/20 check commands PASS**, Next build PASS, CF build FAIL. Exact checks:

| Command | Exit | ms |
| --- | --- | --- |
| node --experimental-strip-types scripts/test-standards-source-page.ts | 0 | 298 |
| node --experimental-strip-types scripts/test-standards-clause-boundary.ts | 0 | 240 |
| node --experimental-strip-types scripts/test-generic-clause-parser.ts | 0 | 155 |
| node --experimental-strip-types scripts/test-clause-casing.ts | 0 | 170 |
| node --experimental-strip-types scripts/test-cortex-standards.ts | 0 | 256 |
| node --experimental-strip-types scripts/test-standards-presentation.ts | 0 | 198 |
| node --experimental-strip-types scripts/test-request-auth.ts | 0 | 328 |
| node --experimental-strip-types scripts/test-request-auth-contract.mjs | 0 | 234 |
| node --experimental-strip-types scripts/test-ingestion-publication-visibility.ts | 0 | 190 |
| node scripts/test-cortex-standards-topic-retrieval.mjs | 0 | 668 |
| node scripts/test-standards-evidence-retry.mjs | 0 | 726 |
| node scripts/test-standards-legacy-fallback.mjs | 0 | 662 |
| node scripts/test-security-baseline.mjs | 0 | 131 |
| node scripts/guard-next-security-baseline.mjs | 0 | 110 |
| node scripts/test-qa-ingestion-edge-guard.mjs | 0 | 137 |
| node scripts/test-qa-pr61-multipage-dispatch-guard.mjs | 0 | 110 |
| node scripts/test-document-identity.mjs | 0 | 126 |
| node --experimental-sqlite scripts/test-ingestion-restore-roundtrip.mjs | 0 | 113 |
| node --experimental-sqlite --experimental-strip-types scripts/test-published-evidence-generation.ts | 0 | 208 |
| node node_modules/typescript/bin/tsc --noEmit --incremental false | 0 | 10237 |
| npm.cmd run build | 0 | not separately measured |
| npm.cmd run cf:build | 1 | not separately measured |

CF failure: esbuild cannot read parent directory '..' (Access is denied), then cannot resolve open-next.config.ts. No sandbox CF PASS claimed; prior host CF PASS preserved as historical baseline evidence. Initial Python edit attempt failed (Python unavailable); premature test failed on unresolved markers. Node resolution and final 348-case runs passed. git diff --check PASS.

Git completion BLOCKED: explicit git add of only ROADMAP.md, scripts/test-standards-source-page.ts, app/lib/cortex-standards-engine.ts and this report failed creating linked-worktree index.lock (Permission denied outside workspace). Thus working files are resolved but index still has unmerged entries; staging and cherry-pick --continue require host. Continue not attempted with unmerged index. No abort/reset/force or metadata workaround. Host: stage exactly those four files, then git cherry-pick --continue (preserves original -x operation). No .qa-npm-cache staged.

Security/auth/private-path/page/publication/paid-QA assertions pass; no network audit performed. Legacy fallback characterization retains known irrelevant-nonempty-hit relevance gap. Synthetic checks do not prove semantic entailment, edition/fingerprint applicability, live Clerk customer citation, archive deduplication/update/cache invalidation or remote D1+dual Vectorize restore. These and exact-final-head Node22 CI, supported-host CF rebuild, independent QA and release approval remain gates. No paid calls, cloud access, push, merge or deploy; real provider cost/latency unmeasured. Release/Issue60 NO-GO.
