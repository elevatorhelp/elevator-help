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
