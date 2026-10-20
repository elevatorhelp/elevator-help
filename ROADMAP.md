# elevator.help — SINGLE EXECUTION ROADMAP

**Canonical plan — one source of truth.** Updated 2026-10-20.
**Owner:** elevator.help project owner. **Implementation:** engineering/Codex with GitHub PR + CI + production evidence.
**Target Beta sign-off:** **2026-11-13**. **Target Gamma sign-off:** **2026-12-11**.
**GitHub privacy/repository decision and execution:** **2026-12-14 to 2026-12-18, AFTER Gamma**.
These are timeboxed **targets**, not claims that the work is complete or unconditional delivery guarantees. Feasibility must be checked on 2026-10-23 and explicitly escalated if impossible.

## 0. Operating contract — prevent circular work

1. **This file is the only authoritative sequence, deadline and status ledger.** GitHub issue #25 points here; #39/#40 and other issues are supporting work tickets, not competing roadmaps. Chat discussions do not change scope or architecture until this file is updated in a reviewed PR.
2. **Architecture C is locked** unless a measured benchmark proves a specific change beneficial: Gemini = intent/reasoning/answering; D1 = exact evidence/version metadata; Vectorize = semantic retrieval; Gemini Embedding = multilingual vectors; public web fallback when justified. Gemini managed File Search is an optional, *selective* tool candidate, not a wholesale replacement.
3. **No repeated debates without new evidence.** Each decision is recorded with rationale, acceptance test and date in the Decision Log below. A new proposal must show comparative accuracy, citation fidelity, ingestion speed, cost, latency and privacy.
4. **One blocking priority at a time.** Work-in-progress limit: one main blocking milestone; a second task only if independent and non-disruptive (e.g., read-only benchmark). Do not interrupt archive catch-up for UX polish.
5. **Definition of DONE:** code merged after CI, production behavior verified where applicable, test evidence linked, real end-to-end acceptance met, remaining risks documented. Green build or successful scheduled ingestion alone never means indexing or citations are complete.
6. **No silent deadline drift.** Every Friday: update this file with actual completed/pending/blocked tasks, evidence, next owner/action, estimated remaining work and target dates. If a critical gate misses its date, publish the blocker and two options within 24 hours: unblock with bounded resources, or explicitly re-scope/re-date with owner approval.
7. **No shortcuts:** isolated branch → tests → reviewed PR → CI gates → controlled deployment → production smoke/rollback; back up before risky writes. No new paid services, broad private-document export, production destructive changes, or scope expansion without explicit owner approval.
8. **Safety is not deferrable.** Inaccurate normative claims, private-data exposure, missing backup/restore capability and unauthorized execution block release. Cosmetic features may be deferred with explicit approval; do not silently declare an incomplete Gamma finished.
9. **Progress must be auditable.** Status uses only DONE / IN PROGRESS / BLOCKED / NOT STARTED and a linked GitHub run/PR/measurement. Do not claim autonomous/background work unless an actual scheduled workflow/automation is verified.

## 1. Scope and success

Deliver a **multilingual Super GPT for elevator engineering**: natural DE/EN/FA dialogue, verified source-grounded standards and manufacturer troubleshooting, continuously updated whole-archive retrieval, technical document/photo handling, safe spreadsheet calculations, preliminary My Elevator planning, and privacy-safe version-aware FAQ/learning.

- Gemini is the reasoning brain. Do not expose storage/index internals to public users.
- Verified normative/safety claims must cite the correct primary-source document, edition, page and clause; otherwise clearly state uncertainty. A generated skill, web summary or cached answer is not primary normative evidence.
- Generic engine, independent of folder/manufacturer/controller/language/file name. No special-case fixes for one test prompt.
- Live Archive includes standards, error manuals, manufacturer and supplier technical catalogs, Office files and unknown folders. No folder-only validation.
- Technical catalog retrieval is in scope. **Jobbörse, vendor registration, quotes, ordering and supplier marketplace are NOT in scope**; those belong to future Elevator Agent AI.
- Payment/subscription is not a Gamma exit dependency unless separately approved.

## 2. Fixed delivery calendar and release gates

| Deadline (Germany local) | Milestone | Required proof / deliverable | Current status |
| --- | --- | --- | --- |
| **Fri 2026-10-23** | **M0: baseline + feasibility gate** | Fresh archive totals per phase; throughput/backlog and D1/Gemini budgets; real D1 restore gap; 12-case File Search benchmark design; confirm whether Nov 13 is feasible | NOT STARTED |
| **Fri 2026-10-30** | **M1: safe ingestion throughput** | Fair phase scheduling, recoverable checkpoints, measured daily progress, quota-safe throughput, per-class extraction diagnostics, backup/recovery plan; no uncontrolled mass reindex | IN PROGRESS (implementation exists; proof pending) |
| **Fri 2026-11-06** | **M2: whole-archive indexing and retrieval gate** | Evidence/raw vectors/document maps converge across supported documents; exception ledger; multilingual, rename/delete/version and real retrieval checks; 12-case managed File Search comparison and decision | NOT STARTED |
| **Fri 2026-11-13** | **M3: Beta sign-off** | Golden QA of real source/page/clause, fault codes and multilingual follow-ups; real account/mobile tests; zero critical safety/citation/privacy failures; human sign-off | NOT STARTED |
| **Fri 2026-11-20** | **M4: Gamma UX + private multimodal** | Six intent-aware starters; mobile/feedback polish; secure private photo/PDF/Office uploads, intent clarification, isolation, retention/deletion tests | NOT STARTED |
| **Fri 2026-11-27** | **M5: Gamma safe calculations** | Approved archive and user Excel workbooks in sandbox, unit/formula checks, reproducible test fixtures, no macros/arbitrary code | NOT STARTED |
| **Fri 2026-12-04** | **M6: My Elevator + verified answer catalog** | Preliminary engineering planning and catalog sourcing; versioned FAQ/learning with privacy review and invalidation; user-facing citations | NOT STARTED |
| **Fri 2026-12-11** | **M7: Gamma final release/sign-off** | Security, backup/restore drill, performance/cost, human E2E, release/rollback runbook, full acceptance report and explicit owner sign-off | NOT STARTED |
| **2026-12-14–18** | **M8: GitHub visibility/structure LAST** | Decide whole private repo vs private brain split, review GitHub plan/CI integrations, preserve backups, change visibility, rerun CI/ingestion/deploy/auth | NOT STARTED |

**Feasibility alert:** Scheduled ingestion currently runs 4 times/day and is configured for only 2 files per scheduled run. Three document phases mean this rate alone may be insufficient to finish the backlog by M2. **M0 must calculate actual phase-work remaining, safe maximum throughput and projected completion; if M2 cannot be met, escalate immediately instead of inventing a completion claim.** Do not increase Cloudflare/Gemini spend without measuring and authorization.

## 3. Work packages (checklist)

### M0 — measure first, decide once (Oct 20–23)

- [ ] Read-only snapshot: Drive discovered/supported/excluded documents; D1 indexed files/chunks; Vectorize vector counts; per-phase evidence/raw/map backlog, failure counts, actual latest checkpoint, last successful write.
- [ ] Profile time/cost per document: Drive download, unpdf/LibreOffice extraction, D1 exact evidence, Gemini embedding, Vectorize upsert, map generation. Capture actual API calls, rate limits, D1 free-tier writes and failure modes.
- [ ] Estimate work remaining and safe required throughput to reach Nov 6, with conservative allowance for new archive uploads; flag schedule infeasibility.
- [ ] Define representative **12-case** Gemini managed File Search vs existing Architecture C benchmark: standards/clause fidelity, multilingual, fault catalogs, tables, scanned docs, source changes and ambiguous queries. Use synthetic/public fixtures first; no private document export without authorization.
- [ ] Confirm latest live security/Clerk status and backup restore status; open concrete blockers only.

### M1 — archive engine and safety (Oct 24–30)

- [x] Implemented: Drive discovery, document identity/language resolver, incremental fingerprints, exact D1 evidence, Vectorize, map phase, checkpoint/cursor, scheduled ingestion.
- [x] Implemented: fair phase preference rotation and per-phase cursors (real starvation prevention still needs observed proof).
- [ ] Prove all three phases progress even under daily uploads and that phase cursor/checkpoint survives restart and failed files.
- [ ] Safely improve ingestion throughput only where measurement justifies it; keep quotas, concurrency and Gemini cost controlled.
- [ ] Build per-page extraction quality/exception reports; evaluate selective OCR and layout-aware tables/formulas with preserved page/section anchors.
- [ ] Verify remote consistent D1 backup + restore and reconstructable Vectorize/index/checkpoint recovery, not merely offline export script or evictable Actions cache.
- [ ] Compare Docling, MarkItDown, LlamaIndex, OpenNotebook, book-to-skill with current pipeline across all document families; accept tools only if demonstrated benefit and safe outbound data flows.

### M2 — whole archive + File Search decision (Oct 31–Nov 6)

- [ ] Check Evidence, raw vector and document map completion **separately**, including all supported folders/languages/formats. Record explicit extraction exceptions and how user answers behave for them.
- [ ] Test new/modified/renamed/moved/deleted files, multilingual editions, duplicates, version conflict and stale index invalidation.
- [ ] Verify map persistence/retrieval after restart and actual semantic retrieval on newly indexed content.
- [ ] Execute 12-case File Search comparison and record: ingestion time, retrieval latency, accuracy, citation precision, cost, storage/lock-in, permission/privacy. **Decision:** retain C by default; adopt selective File Search only if proven better and standards verification remains deterministic.
- [ ] Freeze architecture decision for Gamma implementation; no wholesale migration or simultaneous parallel search stacks without measured need.

### M3 — Beta real-answer gate (Nov 7–13)

- [ ] Golden QA: unrelated real standards (EN 81-20/50, DIN EN 81-70/76, ISO 8100), exact clause/version/page, conflicting editions, error codes and explanations in both directions, technical catalogs, cross-document questions.
- [ ] DE/EN/FA natural language, German compounds, misspellings, follow-ups, unknown and ambiguous manufacturer/controller, out-of-archive fallback, source provenance labels.
- [ ] No fabricated normative/safety-critical limits or unsupported citations; independently verify returned quote/edition/page/clause against source.
- [ ] Human mobile and desktop QA: Clerk registration/email verification/sign-in/sign-out/reset, authorized API calls, 10-question/day limit, edit/resend, input anchor/scroll, language and accessibility.
- [ ] Review legacy Learning PII rows, production logs, privacy notices, account deletion and access control; fix confirmed risks.
- [ ] Human owner signs Beta exit or issues a blocking defect list. Do not label Beta done on CI alone.

### M4 — Gamma 1 + 2: UX, images and documents (Nov 14–20)

- [ ] Six starters: troubleshoot fault; technical document search; **“What says Norm about …”**; shaft planning; send photo; upload document.
- [ ] Ask user what to do with ambiguous uploads; avoid inferring invisible technical details or initiating supplier workflows.
- [ ] Image/PDF/Office analysis with evidence anchors and uncertainty; safe per-user temporary uploads, type/size/rate limits, consent, deletion and isolation.
- [ ] Like/dislike feedback, useful FAQ signals, mobile polish; no persistent personal chat history by default and no automatic ingestion of user files into shared archive.
- [ ] Prompt-injection tests on malicious document content and unauthorized file cross-access.

### M5 — Gamma 3: safe Excel tools (Nov 21–27)

- [ ] Identify approved archived calculation workbooks and user-uploaded spreadsheets; preserve original formulas and workbook/version identity.
- [ ] Sandbox execution with limits, no untrusted macros, arbitrary code, network access or external references.
- [ ] Validate units, inputs, formulas, assumptions and output provenance; cross-check engineering calculations where possible.
- [ ] Test shaft loads, lifting beam, 4:1, 10t, MRL/hydraulic examples; clearly mark preliminary vs certified engineering.
- [ ] Cover unsupported/malicious workbook cases and repeatability.

### M6 — Gamma product intelligence and reusable answers (Nov 28–Dec 4)

- [ ] My Elevator technical finder: load/person count, cabin/shaft constraints, type, manufacturer technical catalogs; no invented specifications.
- [ ] Quarantined version-aware Answer Catalog/FAQ: verify source and permission before reuse or publication; invalidate on source/standard edition/model/policy change.
- [ ] Audit old learning rows; privacy-safe aggregation and feedback. No user question, private document or generated normative claim published automatically.
- [ ] Verified technical SEO/GEO pages only after evidence quality; measure cost saving and false-reuse rate.
- [ ] Document handoff interface for future Elevator Agent AI without implementing marketplace or Jobbörse.

### M7 — Gamma exit and reliability (Dec 5–11)

- [ ] E2E tests across document types, languages, devices, user accounts and edge cases.
- [ ] D1 + index + checkpoint backup/restore drill; incident and rollback playbook.
- [ ] Security/privacy review: Clerk, secrets, logs, retention, GDPR, archive permissions and third-party tool data flow.
- [ ] Actual cost per question/document, D1 and Gemini quotas, latency and load; alerts for ingestion backlog and citation failure.
- [ ] Production deployment smoke and human sign-off, documented accepted non-critical deferrals. **Zero open critical safety/privacy/citation/recovery blockers.**

### M8 — GitHub LAST (Dec 14–18)

- [ ] Compare making entire repository private vs private proprietary-brain repository plus public site.
- [ ] Verify GitHub Actions quota, private repo branch protection/rulesets, GitHub app/Codex access, Cloudflare integration, secrets and CI.
- [ ] Review complete public Git history and external copies; making a public repo private does not erase copies already made.
- [ ] Preserve code/data/checkpoint backups; change repo only after Gamma owner sign-off; test CI, archive sync, deployment, auth and live service after change.

## 4. Decision log — do not re-litigate without evidence

| Date | Decision | Revisit only if |
| --- | --- | --- |
| 2026-10-18/20 | **Combined Architecture C**: Gemini reasoning + D1 exact evidence + Vectorize + Gemini Embedding. | 12-case comparison proves selective improvement in accuracy/cost/latency without losing exact citation control. |
| 2026-10-20 | Gemini managed File Search **is not the deployed archive indexer**; it is a benchmark candidate for selective ingestion/retrieval assistance. | M2 benchmark documents measured benefit and a safe rollout/rollback. |
| 2026-10-20 | Full archive and real citations before Beta sign-off; no one-folder or one-standard shortcuts. | Never for safety/standards correctness. |
| 2026-10-20 | Finish Gamma before changing GitHub repository visibility/structure. Secrets and private data protections remain immediate. | Critical confirmed security exposure requiring emergency mitigation. |
| 2026-10-20 | No Jobbörse or commercial supplier marketplace in elevator.help. | Separate explicit product-scope decision. |

## 5. Current verified snapshot (2026-10-20)

**DONE:** PR #47 learning-PII/secret-ignore hardening; PR #48 guarded release; post-merge Build Check and production deployment success. Gemini router, Gemini multilingual embedding code, D1 exact retrieval, Vectorize, incremental Drive ingestion and fair-phase selection are implemented.

**NOT PROVEN:** full archive indexing across all three phases; production end-to-end citation correctness; backup and restore drill; broad human Beta; multimodal uploads; sandboxed Excel; validated FAQ/My Elevator; managed File Search benchmark result. Latest archived source counts are historical snapshots, not current completion evidence.

**Open supporting tickets:** #39 (phase fairness/backlog), #40 (Docling/MarkItDown/other tools), #25 (Gamma tracking). Experimental PRs #42/#45 are not pre-approved for merge.

## 6. Weekly status update template (update IN THIS FILE, not in a new roadmap)

| Reporting date | Active milestone | Done with evidence | Pending / blockers | Measured throughput / cost | Forecast deadline | Next action / owner |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-20 | M0 | PR #47/#48 + green Build/production deploy | Fresh backlog, restore proof, File Search benchmark, Beta E2E | Not yet measured | M0: Oct 23; Beta: Nov 13; Gamma: Dec 11 | Engineering: read-only baseline, capacity forecast and benchmark design |

**Escalation rule:** If M0 shows the Nov 6 archive gate is infeasible under safe quotas, present a concrete accelerated option (time/cost/risk) and a revised deadline option for owner decision. Never silently increase paid API use or claim complete coverage.

## 7. References (supporting, not competing)

- SUPER_GPT_VISION.md — architectural charter
- ARCHITECTURE_AND_TOOLING_HANDOFF.md — current implementation and reusable design
- ARCHIVE_INDEX_ROLLOUT.md — exact evidence and migration safety
- D1_REGULAR_BACKUP_VERIFICATION.md — offline backup verification and limits
- GitHub #25 — roadmap tracking and Gamma scope
- GitHub #39 — phase scheduling/backlog
- GitHub #40 — extraction/tool benchmarks

**Next authorized task:** M0 read-only evidence and feasibility assessment. No change to production ingestion rate or architecture until evidence and approval.
