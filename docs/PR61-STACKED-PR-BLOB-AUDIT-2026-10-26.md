# PR61 / Issue60 stacked-PR content-equivalence audit — 2026-10-26

**Scope:** read-only GitHub blob-SHA comparison of selected implementation, schema and regression files against integration PR #63 at head `5f1432d918bbf50a232f5e13d0b66cd2f017b02c`. Compared exact repository paths at each source PR head. Equal Git blob SHA means **byte-for-byte identical content** at the compared refs; unequal does **not** establish that the patch is absent or incompatible. No PR was merged, closed, force-pushed or approved.

| PR | Compared implementation/schema/test files | Exact blob matches | Non-identical paths | Decision |
| --- | ---: | ---: | --- | --- |
| #64 (head `54600ec`) | 4 | 4 | none in compared set | Core lease code/schema/test already byte-identical; separate workflow not compared |
| #65 (head `97bbe3a`) | 5 | 3 | `app/lib/ingestion-publication-visibility.ts`; `scripts/test-ingestion-publication-visibility.ts` | Publication generation/schema present; visibility code/tests have later differences requiring patch-level review |
| #66 (head `4225292`) | 3 | 1 | `app/lib/ingestion-full-publication.ts`; `scripts/test-ingestion-full-publication.ts` | Schema identical; later implementation/test differences require patch-level review |
| #67 (head `9149573`) | 2 | 2 | none | Auth implementation and tests byte-identical; **do not double-merge** |
| #68 (head `a3bb1b6`) | 2 | 0 | visibility implementation and test | Later integration modifications require semantic patch-level review; no inference of missing guard |

**Not audited here:** workflow-only differences for #64–#68, and all patches of #61, #69 and #70. Do not close any of these PRs based solely on this blob audit. An exact SHA match is not a functional E2E test and does not prove production release readiness.

**Independent exact-head CI observation:** GitHub Build Check run `40269846648` for PR #63 head `5f1432d918bbf50a232f5e13d0b66cd2f017b02c` reported `completed/success` at the time of this audit. This predates any subsequent audit commit and does not prove Clerk-signed customer answer, isolated D1/dual-Vectorize rollback, real Drive restart, deployment, or production QA.

**Gate:** remain Draft / NO-GO. Require patch-level review of non-identical files, full exact-head CI after final changes, independent QA, genuine authorized Clerk citation, isolated recovery evidence, and owner-approved release gates before dependency-safe merge and superseded PR/Issue60 closure. No production data or secrets were accessed.

## Follow-up semantic patch review — 2026-10-26, integration head `3486798ca81966e216d4df634e97224cec7f92d8`

Reviewed the **actual GitHub PR file patches**, not only blob hashes, for #65's two non-identical visibility paths, #66's two non-identical full-publication paths, and both #68 visibility paths. Compared their added invariants against the exact integration-head source and existing regression assertions. This is a source-level reconciliation, **not** live Cloudflare QA.

| Source | Patch-level disposition at integration head | Evidence and caveat |
| --- | --- | --- |
| #65 visibility implementation/test | **Subsumed with stricter guards** | `parseStagedId` and generation comparison remain; #63 additionally rejects malformed `g[digits]:` IDs, fails closed for configured-but-unusable D1 and transient D1 failures, and caches publication lookups per invocation. Existing test asserts generation switch and strict mode. The earlier #65 catch-all legacy fallback is intentionally **not** copied because it could resurrect superseded vectors during D1 outages. |
| #66 full-publication implementation/test | **Subsumed with stricter manifest and metadata validation** | Staging and atomic three-layer SQL CAS remain. #63 additionally validates evidence page/chunk/source identity before writes, and uses `hasBoundedFullPublicationManifest` to require nonempty bounded RAW/Evidence/Map manifests. Existing test covers absent Map, bad fingerprint/RAW, immutable evidence, complete publish and stale lease. Earlier #66 allowed empty Map at the direct function boundary; do **not** restore that behavior. |
| #68 visibility implementation/test | **All reviewed safety changes present** | #63 includes #68's malformed staged-ID rejection, absent/unusable D1 fail-closed logic, unattributed legacy rejection and matching negative regressions. It additionally bounds D1 queries to one per source per call, caches failed reads fail-closed, and includes D1 generation rollback visibility assertions. |
| #67 auth implementation/test | **Byte-identical in previous blob audit** | Avoid duplicate merge; this audit does not establish positive signed Clerk customer auth. |

**Decision:** Do **not** independently merge #65/#66/#67/#68 on top of #63 without a fresh diff and dependency check: doing so can reintroduce less restrictive source behavior or duplicate implementation. This audit is a content-equivalence/review artifact only. The standalone workflows and #61/#69/#70 still need complete patch-level review before any PR closure. PR #63 remains **Draft / NO-GO**; production, Clerk-signed answer, dual-Vectorize restore, genuine Drive restart, independent QA and owner release authorization are unproven. No merge, production write, credential access or paid operation occurred.
