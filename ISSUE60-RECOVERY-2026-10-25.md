# Issue #60 recovery evidence — 2026-10-25

Local uncommitted candidate only. Issue #60 and PR #61 closure remain NO-GO.

Baseline/unchanged HEAD: `eb54b3ee5ae077a23675c551f695189f51f1aead` (integration PR #63 head supplied by owner). Initial git status was clean. Windows PowerShell, Node v24.19.0. All work confined to this worktree; no commits, pushes, merges, deployment, paid calls or cloud mutations. Read-only GitHub Issue #60 inspection only.

## System problem and scope
The pure capacity planner trusted a caller-supplied baseline as authority to exceed the established two-file fallback without fresh resource telemetry. This directly violates Issue #60's missing/stale telemetry acceptance gate. Current scheduled production uses two, so no production overrun is established.

Read SUPER_GPT_VISION.md, ROADMAP.md, Issue #60, drive-ingest scheduling/checkpoint/resume code, workflow limits and existing planner/ingestion/publication tests. Gemini reasoning and primary source evidence paths are unchanged. The controller remains feature-gated and wired with adaptiveEnabled:false. Existing workflows, MAX_FILES production two-file setting, Gemini hard ceiling and auth boundaries were not edited.

## Failing before, passing after
Added regression BEFORE implementation. Exact command:
`node --test scripts/adaptive-ingestion-controller.test.mjs`
Exit 1: new test failed with `baseline: baseline=3, cursor=0; 3 !== 2`. 13 passed, 2 failed; the unrelated existing checkpoint restart case also failed because unpdf was absent.

Minimal fix: clamp fallback baseline to two in scripts/adaptive-ingestion-controller.mjs. Lower explicit maxFiles caps (including zero) remain effective. Fresh valid telemetry and explicit adaptive cap can still select more than two; no production acceleration is enabled.

New regression evaluates 48 combinations: three oversized baselines, four phase cursor values, and disabled/missing/stale/non-finite telemetry. Every decision is repeated after JSON serialization to model replay of persisted input after interruption; decisions and bounds must match. A second test proves fresh telemetry still permits explicit adaptive capacity. These are pure planner replay tests, not actual durable checkpoint recovery or duplicate remote-write proof.

Final focused command:
`node --test --test-name-pattern='untrusted baseline|fresh telemetry still' scripts/adaptive-ingestion-controller.test.mjs`
Exit 0: 2 tests passed, duration 83.8937 ms (individual assertions 2.6172/0.1517 ms). Single local sample, not ingestion latency or benchmark evidence.

## Validation commands and exits
All commands below ran against unchanged HEAD plus the local patch. No final committed SHA/CI exists.

| Exact command | Exit | Result |
| --- | --- | --- |
| `node --test scripts/adaptive-ingestion-controller.test.mjs` | 1 | Blocked: missing unpdf |
| `node scripts/test-incremental-ingestion.mjs` | 1 | Blocked: missing unpdf |
| `node scripts/test-security-baseline.mjs` | 0 | PASS |
| `node --experimental-strip-types scripts/test-request-auth.ts` | 1 | Blocked: missing @clerk/backend |
| `node --experimental-strip-types scripts/test-gemini-cost-control.ts` | 0 | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-multibatch-recovery.ts` | 0 | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-full-publication.ts` | 0 | PASS |
| `node --experimental-strip-types scripts/test-ingestion-publication-visibility.ts` | 0 | PASS |
| `node --experimental-sqlite scripts/test-ingestion-restore-roundtrip.mjs` | 0 | PASS |
| `node scripts/test-qa-ingestion-edge-guard.mjs` | 0 | PASS |
| `node node_modules/typescript/bin/tsc --noEmit` | 1 | Blocked: missing TypeScript |
| `npm.cmd run build` | 1 | Blocked: missing Next.js |
| `node --test --test-name-pattern='^(?!phase cursor and partial)' scripts/adaptive-ingestion-controller.test.mjs` | 1 | Blocked: missing unpdf |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-complete-publication.ts` | 0 | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-generation-publication.ts` | 0 | PASS |
| `node scripts/test-cortex-standards-topic-retrieval.mjs` | 1 | Blocked: missing TypeScript |
| `node --experimental-strip-types scripts/test-standards-clause-boundary.ts` | 0 | PASS |
| `npm.cmd run cf:build` | 1 | Blocked: missing OpenNext |
| `git diff --check` | 0 | PASS |

The full planner suite after the final test addition had 15 passes/1 failure (missing unpdf), not an all-green suite. The attempted negative name filter did not exclude that test in this Node invocation; its exit 1 is retained above. Existing SQLite tests cover interrupted batches, restart/takeover, stale leases, duplicate publication, exact manifests and generation visibility; they are offline protocol evidence only. Standards clause test covers unseen-source positives and numeric/nested/annex collisions. No real heterogeneous archive corpus was ingested.

Dependency attempts:
- `npm ci --offline --ignore-scripts --no-audit --no-fund --cache .npm-cache`: exit 1, PowerShell npm.ps1 execution policy.
- `npm.cmd ci --offline --ignore-scripts --no-audit --no-fund --cache .npm-cache`: exit 1, ENOTCACHED for youch-core 0.3.3; cleanup EPERM warnings. No network installation attempted. Partial ignored node_modules and untracked .npm-cache may remain.
- Cache cleanup was rejected by the tool execution policy; no permission escalation attempted. This is generated local install debris, not part of the proposed source patch.

## Safety, cost and remaining gates
No new security surface, services, dependencies, vendor/document branches or source-evidence transformations. No runtime auth/cost code changed. Static security, cost guard, isolated QA edge, publication and visibility tests pass; actual Clerk auth regression remains dependency-blocked. Paid calls: zero; no actual D1/Gemini billing or ingestion latency measured.

Dynamic ingestion, changed revisions, cache invalidation, source deduplication, durable checkpoint authority and lease fencing are not modified by this fix; passing existing offline protocol tests does not prove complete archive recovery. The historical RAW TypeError and exact failing production document are not reproduced or claimed fixed.

Before closure: restore dependencies and rerun full planner/incremental/auth/safety/type/Next/OpenNext checks; exact final-head Node22 CI and independent QA; real authenticated customer source/edition/page/clause proof; isolated cross-system D1/Vectorize restore/replay; measured bounded concurrency, cost and heterogeneous/unseen archive progress; reconcile stacked PRs deliberately; owner-authorized release and confirmed production validation. No release or complete ingestion claim.


### 2026-10-25 — PR61/Issue60 fail-closed controller revalidation and read-only source inventory

- **Fresh local recovery revalidation, baseline `eb54b3ee5ae077a23675c551f695189f51f1aead`:** `npm.cmd ci --prefer-offline --no-audit --no-fund` PASS (349 packages); `node --test scripts/adaptive-ingestion-controller.test.mjs` **16/16 PASS**; `node scripts/test-incremental-ingestion.mjs` PASS (multilingual, phase fairness, checkpoint/restart, bounded Gemini reservation); `node --experimental-strip-types scripts/test-request-auth.ts` PASS; `node node_modules/typescript/bin/tsc --noEmit --incremental false` PASS; `npm.cmd run build` PASS; `npm.cmd run cf:build` PASS; `git diff --check` PASS. This supersedes the earlier local dependency-blocked statuses for this isolated patch, not any missing real-cloud gate. Windows Node24 local evidence only; exact-final-SHA Ubuntu Node22 CI still required.
- **Code fix:** adaptive planner clamps untrusted configured fallback baseline to the established two-file ceiling when telemetry is missing, stale or disabled; fresh valid telemetry can still enable separately bounded adaptive capacity. Added deterministic 48-case cursor/baseline/telemetry replay regression and explicit fresh-telemetry positive case. No production flag, schedule, paid call or throughput changed.
- **Production D1 READ-ONLY inventory:** Wrangler OAuth `d1 execute elevator-help-cortex --remote` performed SELECT/PRAGMA only, with **0 rows written** on every command. Existing archive_chunks has 1,131 filename-matched EN81-20 chunks across four source IDs, all with source fingerprints. The independently identified German 2014 candidate contributes 299 chunks, one source ID/fingerprint, physical PDF pages 1–175. Exact clause-key match for 5.4.7.4 appears in five rows on physical PDF pages 37, 52, 78 and 79; pages 37/52 may be cross-references and cannot be treated as clause provenance. Direct source inspection elsewhere identified printed pages 73–74, but a verified printed-to-physical mapping and exact excerpt/edition/fingerprint equality have **not** been established here. Production D1 has legacy archive tables but **no staged generation/receipt publication tables**; it cannot substantiate safe staged publication or D1+dual-Vectorize rollback. No private file IDs or text were logged in this roadmap entry.
- **Release gate:** still **NO-GO**. Real signed Clerk customer answer with verified edition/page/clause, full-state isolated D1+both Vectorize restore/replay, real bounded concurrency/cost, exact-final-head CI, independent QA, stack reconciliation, explicit owner release approval and post-deploy QA remain mandatory. No Production mutation, paid provider call, merge or release. Historical RAW TypeError not claimed fixed.
