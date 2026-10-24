# PR61 / Issue60: bounded customer standards citation gate

**Decision: NO-GO for release, merge, deployment or Issue60 closure.** GO for review of the local source-page rejection fix only.

Initial and final committed HEAD: `eb54b3ee5ae077a23675c551f695189f51f1aead` (detached PR63 baseline). Initial `git status --short` was empty. All changes below are uncommitted and have no final-change CI evidence. Environment: Windows PowerShell, Node `v24.19.0`. Work confined to `C:\Users\Baharmand\elevator-help-PR61-ARCHIVE-QA-20261024`.

Read `SUPER_GPT_VISION.md`, `ROADMAP.md` and `PR61-CLOSURE-ITERATION-2026-10-24.md`. Historical remote QA and dependency-install claims in those documents were not revalidated here. No other checkout, original, backup, remote, GitHub, production, secrets, paid API or user archive was accessed. No dependency installation, cloud/remote calls, indexing, commit, push, merge, deployment or flag changes occurred. Workflow edits are local only.

## System problem and bounded repair

The source-bound standards verification layer could return `sufficient: true` without a usable primary-source page. Both customer `/api/ask` standards branches translate that boolean into `mode: standards_verified`. Invalid metadata was also coerced: `true` became page 1, and `[17]` became page 17. This is a general provenance failure affecting legacy/exact/semantic evidence, independent of standard, manufacturer, folder or language.

`app/lib/cortex-standards-engine.ts` now parses source-page metadata conservatively in both evidence adapters, allowing positive safe integer numbers and legacy decimal digit strings. Other types, absent values, non-positive/fractional/unsafe numbers and malformed strings cannot provide a page. The shared claim verifier rejects claims without a usable source page; a model-supplied page cannot fill the gap. Valid source pages, exact clause checks, retrieval/publication policies, Gemini reasoning, auth and existing fallback behavior are retained. No edition catalogue or document-specific rule was added.

The topic-retrieval regression previously explicitly allowed a verified claim with page zero normalized to null. Its assertion now requires zero verified claims. The new source-page and offline auth-contract regressions are added to the existing Build Check workflow; no Actions were invoked.

## Before/after proof

Before changing production code, ran `node --experimental-strip-types scripts/test-standards-source-page.ts` with the initial 32-case semantic matrix: **FAIL**, exit 1, **28 invalid-page cases accepted**, four valid-page cases passed. Cases included absent/null/zero/negative/fractional/unsafe pages, booleans, arrays, objects and malformed strings, across two synthetic identifier families. This was an actual exported `answerStandardsQuestion` call with local model/retrieval I/O doubles, not a replica verifier.

After the fix, extended the same regression to exact D1-index and semantic paths: **PASS**, exit 0, **64 cases** (56 invalid rejected, eight valid retained). Exact-path D1 I/O is stubbed; the actual index reader, adapters, verifier and formatter execute. Source page 17 is retained even when the synthetic model proposes page 999. None of these identifiers, clauses, pages or statements is evidence about a real EN81-20 document.

## Source-to-customer trace and provenance limits

1. `scripts/drive-ingest.mjs`: Drive discovery records ID/name/modifiedTime/size/md5Checksum. `fingerprint(file)` uses Drive MD5 when supplied, otherwise `modifiedTime:size`; this is an ingestion revision marker, not independently authenticated edition evidence. PDF extraction uses `unpdf` with `mergePages: false`; per-page chunks carry `pageIndex + 1`, source file ID/name/path and source fingerprint. This is a physical PDF page ordinal; printed pagination and primary-source edition/title-page correspondence are not independently validated. Office conversion and plain text have additional page-mapping limitations.
2. `app/api/drive-ingest-batch/route.ts`: exact evidence writes retain `page` and `source_fingerprint`; RAW Vectorize metadata carries page, sourceFileId, fileName/sourcePath and sourceFingerprint. Staged ingestion uses immutable lease/generation receipts. `ingestion-full-publication.ts` already rejects invalid staged pages and mismatched immutable evidence/receipt fingerprints; legacy retrieval still requires defensive verification.
3. `app/lib/archive-evidence-index.ts`: exact identifiers/clauses retrieve legacy and staged evidence; staged rows join the active document generation, and active staged publication suppresses older legacy rows for that document. `ingestion-publication-visibility.ts` checks semantic hits against D1 publication, rejects stale/malformed staged IDs and configured-D1 failures; deliberately absent D1 retains legacy-only compatibility. Generation visibility proves publication eligibility, not source truth.
4. `cortex-standards-engine.ts`: exact D1 and semantic candidates enter evidence adapters. Identifier candidates come from metadata, filename/path and excerpt text (including potential cross-references). `standardCodesMatch` uses normalized suffix matching, not an authenticated edition resolver. Fingerprint is carried into Evidence but is not compared against an independent source manifest during answer verification. Gemini proposes claims; verification checks copied quote, parsed exact clause membership, standard match, requested clause and numeric-token presence. The new page gate adds a necessary citation condition; it does not establish semantic entailment, correct attribution of cross-references or edition applicability.
5. `formatAnswer` emits standard/clause/source page, without fingerprint or independent source-document identity in the customer response. In `app/api/ask/route.ts`, both standards-intent paths use `result.sufficient` to return `standards_verified`; insufficiency uses the existing `standards_web_fallback` route, whose prompt requires uncertainty when unsupported and the `Web-based` label. Other safety paths receive the same verifiedClaims/sufficiency. Route/model fallback correctness was inspected in code, not exercised through a running customer app here. This fix prevents the demonstrated missing/invalid-page evidence from qualifying as verified; it does not authenticate a plausible but wrong positive page or prevent every fallback/model misstatement.

**Real EN81-20 source/edition/fingerprint/page/clause remains UNVERIFIED.** No source PDF, Drive metadata, archive export, D1 record, Vectorize record or legitimate signed-in customer answer was accessed in this iteration. No edition, fingerprint or normative claim has been invented. A valid-looking metadata page is necessary but insufficient evidence for release.

## Clerk boundary

Production auth is unchanged. `app/page.tsx` supplies Clerk `useAuth().getToken` to the chat client and sends the resulting token as Bearer authorization. `/api/ask` calls `authorizeChatRequest` and returns an auth error before body parsing, Cloudflare context, quota/routing or model work. Unless the existing explicit `AUTH_REQUIRED=false` opt-out is configured, missing/mistyped flags fail closed, missing Clerk secret returns 503, missing Bearer returns 401. Clerk `verifyToken` receives the secret and actual request origin as `authorizedParties`; an SDK-verified subject is required, and SDK rejection/missing subject returns 401.

`test-request-auth-contract.mjs` executes the actual function with only the Clerk SDK module replaced using a process-local Node loader hook. It proves the positive SDK-verified-subject contract, exact bearer/origin options, unsigned rejection before SDK invocation, missing-subject/SDK-error rejection and missing-secret handling. Static assertions cover client wiring and server auth ordering. The hook is test-only, deregistered afterward and adds no production bypass. **This is not signature verification or a legitimate Clerk session.** The installed-SDK regression cannot run because `@clerk/backend` is absent; authentic Clerk login/token/issuer/expiry/authorized-party validation and end-to-end signed-in answer remain open release gates.

## Commands and outcomes

All PASS entries exited 0. FAIL entries exited 1 and remain blocked; they are not claimed green.

| Exact command | Result |
| --- | --- |
| `node --experimental-strip-types scripts/test-standards-source-page.ts` | FAIL before (28/32); PASS after (64/64) |
| `node --experimental-strip-types scripts/test-standards-clause-boundary.ts` | PASS |
| `node --experimental-strip-types scripts/test-request-auth-contract.mjs` | PASS, mocked Clerk SDK boundary |
| `node --experimental-strip-types scripts/test-cortex-standards.ts` | PASS, source discovery/budget regression |
| `node --experimental-strip-types scripts/test-generic-clause-parser.ts` | PASS |
| `node scripts/test-document-identity.mjs` | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-publication-visibility.ts` | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-published-evidence-generation.ts` | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-full-publication.ts` | PASS |
| `node --experimental-sqlite --experimental-strip-types scripts/test-ingestion-restore-roundtrip.mjs` | PASS, local SQL contract only |
| `node scripts/test-security-baseline.mjs` | PASS, static security only |
| `node scripts/guard-next-security-baseline.mjs` | PASS |
| `node scripts/test-qa-ingestion-edge-guard.mjs` | PASS |
| `node --check scripts/qa-authenticated-ask-citation.mjs` | PASS, syntax only |
| `node scripts/test-cortex-standards-topic-retrieval.mjs` | FAIL: missing `typescript`; revised page assertion not executed by this suite |
| `node scripts/test-standards-evidence-retry.mjs` | FAIL: missing `typescript` |
| `node scripts/test-standards-legacy-fallback.mjs` | FAIL: missing `typescript` |
| `npm.cmd run test:request-auth` | FAIL: missing `@clerk/backend` |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | FAIL: local TypeScript executable absent |
| `npm.cmd run build` | FAIL: `next` executable absent |
| `npm.cmd run cf:build` | FAIL: `opennextjs-cloudflare` executable absent |
| `git diff --check` | PASS |

`npm run test:security` includes a network npm audit, so it was not invoked under the no-remote constraint. No current vulnerability-audit PASS is claimed. Dependencies/manifests/lockfile were not changed. Node22/Linux exact-final-change CI and real Worker/customer E2E were not run. Local passing test commands took approximately 1–5 seconds each including shell startup, with several checks running concurrently; no production latency, throughput or token measurement was taken. Zero remote/paid model calls; no monetary or production latency improvement is claimed.

## Security effect, uncertainty and remaining blockers

Security effect: untrusted or incomplete citation metadata can no longer acquire verified status through the demonstrated page coercion/omission path. Conservative rejection may increase web fallback frequency for legacy or incomplete extraction. No access controls or dependency security floors were relaxed. New and updated documents still rely on the existing fingerprint/checkpoint/generation machinery; content identity, deduplication, deletes/renames and stale cache/vector invalidation are not newly certified by this change. Publication/visibility/local restore tests provide limited regression evidence, not whole-archive or live recovery acceptance. Positive metadata can still be stale or wrong, and whole-excerpt clause membership does not prove the quote belongs to that clause.

Required before release: independently inspect the permitted primary EN81-20 source and exact edition, downloaded content identity and PDF/printed page mapping; verify exact clause/quote and active source generation; run a real Clerk-authenticated `/api/ask` answer with invalid/missing-session controls. Restore dependencies in an authorized environment and pass the blocked focused suites, TypeScript, both builds and current dependency/security audit. Require exact-final-change Node22 CI, independent review, heterogeneous conflicting/unknown-source QA, full-state isolated D1 plus both Vectorize-layer restore/replay/invalidation proof, bounded live concurrency/cost/latency and rollback evidence, final stack reconciliation and owner release authorization. No claim of archive completion, deployment success or Issue60 closure is made. Stop after this bounded local task.

### 2026-10-25 — PR70 source-page guard isolated verification (post-report update)

The earlier missing-dependency and Windows junction-only Cloudflare bundle failures were local environment issues, not a passing release gate. After an isolated `npm ci --prefer-offline --no-audit --no-fund` in this checkout, focused 64/64 source-page cases, mocked Clerk contract, topic retrieval, `npm run test:request-auth`, TypeScript, static security baseline, Next build and `npm run cf:build` all exited 0 locally. No real Clerk session, authenticated production answer, EN81-20 active-generation edition/page verification, remote D1/Vectorize rollback or exact-head Ubuntu CI was demonstrated. PR70 is Draft stacked on PR63; no merge/deploy/Issue60 closure authorized. Evidence logs remain untracked in the local QA checkout. Source edition existence was separately inspected in the owner-authorized Drive archive (DIN EN 81-20:2014-11), but no private source content or Drive identifier is committed.

### 2026-10-25 â€” Owner-authorized primary-source read (bounded, no archive identifiers committed)

Direct read of the owner's Google Drive PDF titled `DIN EN 81-20, 11-2014-DE.pdf` confirmed the document title page states German version EN 81-20:2014 / DIN EN 81-20:2014-11. The source text has section 5.4.7 (car roof), section 5.4.7.3, and section 5.4.7.4. In this PDF's printed pagination, 5.4.7.4 begins on printed page 73 and continues onto printed page 74; the page boundary was observed directly in the extracted source. No normative text, private Drive ID, account data, or copyrighted extract is committed. This is source-existence, edition-label, clause-location and **printed-page** evidence only; PDF physical page ordinal, checksum/fingerprint, edition currency/applicability, ingestion generation, D1/Vectorize mapping, and authenticated customer answer remain unverified. This source read does not authorize verified production citations, merging, deployment or Issue60 closure. PR70 remains Draft / NO-GO pending exact-head CI and remaining release gates.
