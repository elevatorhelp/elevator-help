# PR61 / Issue60 bounded closure iteration — 2026-10-24

Decision: **NO-GO for merge, deployment or Issue60 closure.** One proven citation defect is fixed locally; release gates remain open.

## Scope and baseline

Clean initial worktree: an isolated local checkout of the PR63 baseline (machine path intentionally omitted).
Exact initial and final committed HEAD: `3bec95cefb2cd06663db53d5fc4a11f4d557b042` (PR63 baseline). Changes are uncommitted. Read SUPER_GPT_VISION.md and AGENTS.md before implementation. No other checkout, private archive, secrets, production, paid/cloud API, remote writes, commits, pushes, merges, deployments, Gamma or parallel indexing were used. No Actions were triggered. Node22 Actions remain owner-deferred.

## Proven defect and bounded repair

System layer: source-bound standards claim verification. `verifyClaims` in `app/lib/cortex-standards-engine.ts` used `source.includes(clause)`. A real call to exported production `answerStandardsQuestion`, using injected local retrieval/model responses, accepted a claim for clause `4.2` from an excerpt containing only `4.20`. The supporting quote and statement deliberately contain no clause digits, isolating the defective clause check from the independent number-token guard.

Failing-before command: `node --experimental-strip-types scripts/test-standards-clause-boundary.ts` exited 1: `ZX 410-22: source 4.20, claimed 4.2`, actual true, expected false. After replacing substring membership with `extractClauseNumbers(source).includes(clause)`, the same command exits 0. The regression covers 4.2/4.20, 5.3/5.3.1, A.2/A.20 across three synthetic identifier families, and retains exact 7.1 plus source page 17 on an unfamiliar fourth source. No actual EN81-20 requirements are invented. This proves clause-identity rejection, not semantic correctness of every model claim or a Clerk session.

Small change: two-line verifier edit, one regression file, and one command added to the existing generic-clause CI step. The workflow was edited locally only. Gemini retains its existing reasoning/compilation role; retrieval architecture, ingestion and auth are unchanged.

## Production path inspection

- `/api/ask` calls `authorizeChatRequest` before body parsing, Cloudflare context, quotas, routing or Gemini. Auth defaults closed; missing/mistyped AUTH_REQUIRED does not disable it. Explicit `false` remains an existing intentional opt-out requiring configuration review. Otherwise CLERK_SECRET_KEY is required; only a Bearer token is accepted. Clerk `verifyToken` receives the request origin as authorizedParties and must supply a subject. Existing auth tests cover configuration/missing-token negatives, not legitimate signed-in success.
- Ingestion route chunk metadata contains sourceFileId, fileName, sourcePath, page, chunkIndex and sourceFingerprint. Staged publication uses document generation and exact RAW/Evidence/Map receipts. `archive-evidence-index.ts` queries identifiers and clauses, joins staged evidence to the active D1 generation, and excludes legacy rows superseded by publication. D1 schema fallbacks are explicit; unrelated query failures fail closed at retrieval.
- Standards retrieval combines exact D1 candidates and filtered/unfiltered semantic Vectorize candidates. `filterPublishedMatches` gates semantic hits against D1 active generation. Absent D1 permits the existing legacy-only behavior; configured D1 failures cannot establish publication. Generation/identity handling must still be reviewed against later PR68 changes.
- `evidenceFromArchiveRow`/`evidenceFromMatch` carry source name, page and fingerprint into evidence. Standard identifiers come from metadata, filenames/paths and excerpt text. Fingerprint is carried but is not an edition-validation gate. `standardCodesMatch` uses normalized suffix matching; this iteration does not establish robust edition disambiguation. Cross-references in excerpts can also supply identifiers. These remain review risks, not proven live miscitations.
- Gemini proposes claims; the verifier checks quoted substring, source standard identity, clause identity (now exact parsed membership), requested clause and numeric-token presence. Page is selected only from retrieved metadata and emitted only when a positive safe integer. Formatter displays standard/clause/page; it does not display a fingerprint or independently confirm the source edition. `/api/ask` returns `standards_verified` with formatted answer, empty sources and checked identifiers when sufficient. Missing page can still produce a sufficient claim; release QA demands a displayed positive page.
- `qa-authenticated-ask-citation.mjs` requires HTTPS, a legitimate JWT and configured question/citation, checks missing/invalid sessions, then demands standards_verified and a displayed page. It checks an expected substring, so source edition/page truth still requires primary-source review. It was syntax-checked only. No synthetic fixture proves a legitimate Clerk session.
- `qa-pr61-real-app-e2e.mjs` performs remote D1 mutations and can call real embedding/Vectorize APIs. `qa-pr61-full-app-e2e.mjs` performs actual app lease/publication writes. Worker E2E requires a running isolated service and token. None was executed under this iteration's no-cloud/no-paid constraints. Offline SQLite coverage below cannot substitute for them.

## Local validation (Node v24.19.0, not Node22 CI)

PASS commands: `node scripts/test-security-baseline.mjs`; `node --check scripts/qa-authenticated-ask-citation.mjs`; `git diff --check`.

The following each exited 0 under `node --experimental-sqlite --experimental-strip-types scripts/<file>`:

- test-standards-clause-boundary.ts
- test-ingestion-publication-visibility.ts
- test-published-evidence-generation.ts
- test-ingestion-full-publication.ts
- test-ingestion-complete-publication.ts
- test-ingestion-multibatch-recovery.ts
- test-ingestion-restore-roundtrip.mjs
- test-compact-evidence.mjs
- test-generic-clause-parser.ts
- test-clause-casing.ts
- test-qa-ingestion-edge-guard.mjs
- test-document-identity.mjs

Failed/blocked checks (not green):

- `test-cortex-standards.ts` at unchanged baseline fails its source-wide fixed-allow-list regex because a comment contains an example standard identifier. No safety assertion was removed to make it pass.
- `test-request-auth.ts`: missing @clerk/backend.
- `test-cortex-standards-topic-retrieval.mjs`, `test-standards-evidence-retry.mjs`, `test-standards-legacy-fallback.mjs`: missing typescript.
- `test-staged-qa-endpoint-guard.mjs`: child process cannot import unpdf, so its expected guard assertion fails before the guard is exercised.
- `test-backfill-guards-offline.mjs`: requires verified D1 SQL export; none supplied or accessed. Live-archive offline QA likewise needs an export and was not run.
- `npm.cmd ci --offline --ignore-scripts --no-audit --no-fund`: EPERM accessing local npm cache; cleanup also reported EPERM. No successful dependency installation. Lockfile unchanged.
- TypeScript: initial npx.ps1 blocked by PowerShell execution policy; retry `npx.cmd --offline --no-install tsc --noEmit` fails ENOTCACHED with no local TypeScript. No type-check success claimed.
- `npm.cmd run build`: fails because next executable is unavailable. No Next or Cloudflare build success claimed.
- Dependency vulnerability audit not run (network prohibited); static security baseline PASS is narrower than full npm test:security.

Observed local test commands complete in seconds; no production latency, throughput or token measurements were taken. Zero paid calls; no claim of production cost improvement. Security effect is stricter rejection of wrong clause identity. Exact parser membership can conservatively reject unusual extraction formats; incomplete OCR/clause parsing remains a limitation. Source semantics, claim-to-quote entailment and edition applicability require further review.

## Reconciliation and actionable release gates

No origin/main ref exists locally. No fetch was needed for the bounded defect; main conflict status and current remote PR heads are **unverified**. Do not infer conflict-free integration from this worktree.

1. Restore dependencies within this isolated worktree, rerun the blocked auth/standards checks, TypeScript and Next/Cloudflare builds. Preserve this regression in CI; owner decides when Node22 Actions resume at a final reviewable SHA.
2. Read-only fetch current main and PR61/63/64–69 when authorized/available; record each exact head, ancestry and patch-equivalence. Use PR63 as the proposed integration candidate only after comparing PR61 changes and main conflicts. Preserve existing histories and avoid duplicate merges.
3. Reconcile PR64 lease foundations, PR65 generation/receipt fencing and PR66 complete RAW/Evidence/Map publication in dependency order; compare actual diffs rather than assuming roadmap notes describe current heads. Verify PR67 fail-closed auth already represented by the integration candidate. Compare all PR68 visibility follow-ups, including malformed staged IDs, against PR63; earlier integrated visibility changes are not proof every later fix is present. Inspect PR69's exact scope/head and its QA/conflict findings independently; its branch name is not evidence of completed CI. No branch was merged or closed here.
4. With primary-source access in a separately authorized environment, confirm actual EN81-20 document edition, content fingerprint, PDF page mapping, exact clause and active D1/Vectorize generation. Then execute legitimate Clerk-signed customer /api/ask QA. Missing/invalid auth probes and synthetic positives do not satisfy this gate.
5. Demonstrate isolated live D1 restore plus Vectorize reconciliation/rollback/replay and stale-generation exclusion, including source updates/deletions, deduplication and cache/index invalidation. Offline restore PASS proves only the tested SQL contract. Complete independent security, bounded concurrency, real cost/latency and heterogeneous archive QA, including unknown sources and conflicting editions.
6. Require exact-final-head CI, independent review and explicit owner release authorization before deployment. Verify production only after authorized deployment; then decide whether to close superseded PRs and Issue60. No complete archive ingestion or deployment success is asserted.

**GO:** review the bounded local clause fix and regression. **NO-GO:** merge/deploy/close PR61 or Issue60 until the gates above have evidence.


## Independent follow-up verification and compatibility fix — same day

The initial missing-dependency limitations above were resolved **after** the Codex iteration. On the isolated worktree only, `npm ci --ignore-scripts --no-audit --no-fund` completed (349 packages), followed by a controlled exact devDependency update `@opennextjs/cloudflare` 1.20.10 -> 1.20.12 (`package.json` and `package-lock.json`); `npm ls` confirms Next.js 16.4.2 and OpenNext 1.20.12. This upgrades the known OpenNext QA compatibility gap without downgrading Next. It does **not** prove the Cloudflare runtime until a separately approved isolated deployed smoke test.

Independently reran the production verifier regression, auth, topic retrieval, published-generation visibility and security checks. The full dependency install exposed two stale test fixtures: the topic-retrieval VM's stubbed `extractClauseNumbers` returned [] for every source, which incorrectly rejected a genuine matching clause after the safety fix; the test now returns whole numeric tokens. The broader standards test had an allow-list regex triggered by a source comment and expected only two budget calls despite intentionally performing semantic retrieval after an exact document identifier; the comment was made generic and the budget expectation corrected to three, with no safety assertion removed. Both test suites now pass.

Verified PASS with exit 0: `npm run test:cortex-standards`, `npm run test:request-auth`, `npm run test:security` (npm audit: 0 vulnerabilities at configured production/high threshold), `node scripts/test-cortex-standards-topic-retrieval.mjs`, `node --experimental-strip-types scripts/test-standards-clause-boundary.ts`, `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-full-publication.ts`, `...test-ingestion-publication-visibility.ts`, `...test-ingestion-restore-roundtrip.mjs`, `npx tsc --noEmit --incremental false`, `npm run build` and `npm run cf:build` (OpenNext Worker bundle generated), and `git diff --check`. Environment: Windows Node 24.19.0. No GitHub exact-final-head CI, real Clerk session, cloud restore or production validation has occurred.

Read-only Drive filename metadata identified multiple EN81-20 candidates including two distinct English files with identical names and different byte sizes; their source editions and published fingerprints have NOT been validated. Detailed private Drive IDs are retained in a local note outside the public repository and are not committed.

**Release status remains NO-GO.** All changes are local/uncommitted, no PR merge, deployment or Issue60 closure. The next bounded action is to review this exact diff, reconcile PR63 with PR64–69, then obtain exact-final-SHA CI and real isolated authenticated citation/restore evidence before any production rollout.
