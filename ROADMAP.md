# elevator.help — SINGLE EXECUTION ROADMAP

**Canonical plan — one source of truth.** Updated 2026-10-20.
**Owner:** elevator.help project owner. **Implementation:** engineering/Codex with GitHub PR + CI + production evidence.
**Target Beta sign-off:** **2026-11-13**. **Owner-approved target Gamma sign-off:** **2026-12-11**.
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

**Open supporting tickets:** #50 (critical ingestion capacity blocker), #39 (phase fairness/backlog), #40 (Docling/MarkItDown/other tools), #25 (Gamma tracking). Experimental PRs #42/#45 are not pre-approved for merge.

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

**Next authorized task:** M0 read-only evidence and feasibility assessment (#50). No change to production ingestion rate or architecture until evidence and approval.


## 8. HOW we deliver — execution operating model (approved Gamma target: 2026-12-11)

**Delivery is not a background claim.** The assistant is the **technical coordinator and implementer when connected tools permit**: inspects GitHub/workflows, decomposes work, authors safe changes in isolated branches, requests CI evidence, merges only after gates, reviews production logs, and reports concrete blockers. Existing GitHub Actions runs are real scheduled work; they are not autonomous code developers. Codex Tasks currently reports **zero registered environments** (checked 2026-10-20); do not depend on an imaginary always-on Codex worker. Recheck environment connectivity before assigning a durable Codex coding task. If the user wants scheduled proactive summaries, explicitly create and verify a real automation rather than promising unscheduled follow-up.

### Work management — one queue, no circular discussion

1. **ROADMAP.md is the canonical backlog/order**; one active milestone at a time. Use one GitHub issue per independent actionable blocker/work package, each linked to the milestone, evidence and Definition of Done. **Issue #50 is the first active critical blocker.** Issues #39/#40 support it.
2. **Each issue must have:** observable problem, exact files/flows in scope, owner/tool, due date, acceptance tests, estimated effort and API/Cloudflare cost impact, rollback/stop condition. Do not open speculative implementation PRs.
3. **Work in 24–48h slices:** diagnose → minimal change → targeted regression test → Build Check → PR review → merge → production/real retrieval proof → update roadmap. If one slice fails, isolate it and stop; don't hide failure behind a new feature.
4. **No more than one risky ingestion/retrieval PR active at a time.** Independent read-only benchmarks and docs may proceed in parallel; no competing writes to D1/Vectorize or simultaneous changes to ingest scheduling.
5. **Daily checkpoint while active:** read the latest scheduled ingestion run and backlog, last successful production deploy, CI failures, quota/expense indicators and critical security issues; log metrics, run URL and any blocker. A scheduled GitHub Actions monitoring/reporting workflow can be implemented after permissions and data minimization are reviewed; **not yet installed**.
6. **Friday release checkpoint:** record Done / In progress / Blocked, test links, pending phase work, measured throughput, cost and forecast in the table above. If a milestone slips, escalate the same day with two options: safe acceleration (measured time/cost) or explicit re-scope/re-date with owner approval. Do not quietly change the target.
7. **User involvement is exception-based:** only approve extra spend, external processing of private/paid standards, production destructive migration, security-sensitive account changes, or material product scope/date changes. Routine read-only analysis, documentation, test development and isolated PRs are engineering responsibilities.
8. **Safety/quality before calendar:** zero unverified normative citations, cross-account data leakage or untested restore paths in a release. Optional SEO polish and nonessential UI extras can be deferred only with explicit owner approval, never by silently declaring Gamma done.

### Actual capacity blocker and required intervention (2026-10-20)

[Live Archive run 39438032661](https://github.com/elevatorhelp/elevator-help/actions/runs/39438032661) reports **241 supported documents; Evidence backlog 142, raw-vector backlog 194, document-map backlog 194** (eligible now: Evidence 142, raw 70, map 0). It attempted **2 Evidence files** and indexed **52 exact chunks** with **0/30 Gemini calls reserved**. These are **530 phase-document operations**, not 530 distinct files.

At four scheduled runs/day × two files/run, the theoretical floor is **530/8 = 66.25 days** without failures, new uploads, API limits or uneven document sizes. To clear in ~17 days by Nov 6 requires **≥32 phase-document operations/day** (roughly **8 per run**) as a bare minimum; target **40/day** with margin only if D1/Gemini quotas, CI minutes, checkpoint safety and cost allow it. A fixed larger \`MAX_FILES\` alone is not a validated solution; raw and map phases consume Gemini budget and can hit write/throughput ceilings. **M2 is blocked at current settings.** This 530-operation estimate is **optimistic** because large files may need multiple runs within a single phase.

[D1 read-only health run 39439194167](https://github.com/elevatorhelp/elevator-help/actions/runs/39439194167) showed 7,882 evidence chunks and 2,814 D1 rows written in 24h, with no detected orphan/missing compact/identifier/clause rows. This does not prove Vectorize completion, safe future D1 capacity, or backup restorability.

**Observed raw-phase constraint:** [2026-10-20 raw run 39346996497](https://github.com/elevatorhelp/elevator-help/actions/runs/39346996497) used **all 30/30 Gemini call reservations**; one document paused at **120/299 chunks**, another at **0/140**, and both were checkpointed. Therefore merely raising MAX_FILES may yield **no extra completed documents**; safe Gemini-call throughput, per-document chunking/resume and D1 writes must be measured. The ~67-day floor is NOT a reliable ETA.

**Immediate execution ticket:** [#50 — measure and safely accelerate archive throughput](https://github.com/elevatorhelp/elevator-help/issues/50).

### 72-hour first delivery slice (Oct 20–23)

| When | Concrete action | Responsible path | Output and stop condition |
| --- | --- | --- | --- |
| **Oct 20** | Read current ingestion + D1 health logs; quantify phase backlog, baseline capacity, actual constraints | Assistant + GitHub read-only | **DONE**: 530 phase operations, ~67-day theoretical floor at current rate, source-linked issue #50 |
| **Oct 21** | Inspect multiple recent runs and ingestion code; profile per-phase duration/calls/writes and error cases; establish D1 and Gemini limits | Assistant/GitHub diagnostics, no production writes | Measured throughput and bottleneck table; escalate if quotas/permissions unavailable |
| **Oct 22** | Design/test safe accelerated schedule, checkpoint recovery and rollback; draft 12-case File Search comparison using synthetic/public docs | Engineering PRs, CI only; no unapproved private source upload | Minimal PR(s) and test evidence; no increase in paid spend without approval |
| **Oct 23** | Capacity/feasibility go/no-go: forecast Nov 6 archive gate and Dec 11 Gamma; owner decision only if higher cost/risks needed | Assistant reports with issue #50 and ROADMAP update | Written option A safe acceleration vs B revised timeline/scope |

### Per-milestone delivery loop

| Phase | Engineering work | Evidence of completion | Hard gate |
| --- | --- | --- | --- |
| **M0–M1** | Diagnose and remove ingestion bottleneck; secure checkpoint/backup; benchmark extraction tools | Backlog trend, quota-safe runs, restart and D1 restore proof | No paid mass reindex or unapproved cost |
| **M2** | Whole-archive convergence and 12-case File Search benchmark; choose selective adoption or retain C | All 3 phase counts + representative exact citations + measured File Search result | No migration by assumption; no one-folder proof |
| **M3** | Fix Golden QA failures and user-facing Beta defects | Independent DE/EN/FA tests, clause/version/error QA and real auth/mobile | Human sign-off; no critical false standards claims |
| **M4–M6** | Gamma features in order: private uploads → safe Excel → My Elevator → verified FAQ | Each feature has privacy/security tests, real scenario and demo on production | No macros, cross-account leakage, invented engineering facts |
| **M7** | End-to-end reliability, restore drill, privacy/cost and final release | Full acceptance matrix, rollback runbook, measured costs and explicit approval | Zero critical safety/privacy/recovery blockers |
| **M8** | GitHub visibility/structure **last** | CI/deploy/ingestion/auth retested after change | Only after M7 sign-off |

### Reporting format

Every status report starts with **current milestone / last verified completed item / active blocker / next measurable action / estimated finish vs deadline / user decision required?**. A status without a run, PR, test or measurement must be labeled **unverified**. No filler or indefinite "working on it" claims.


## 9. 2026-10-23 decision checkpoint — reconciliation of Oct 22 chat roadmap

**Status: decision recorded; implementation and production verification remain separate gates.** This section consolidates the Oct 22 discussion that was not previously committed to GitHub. It supplements, rather than supersedes, milestones M0–M8 and the security/approval contract above.

### A. Product charter and reusable engine

- **Elevator.help is a conversational technical-support specialist, NOT a PDF search UI.** Understand product/model/context, ask only necessary follow-up questions, synthesize grounded troubleshooting steps, explain naturally in DE/EN/FA, and avoid unsupported or unsafe instructions. Prioritize excellent manufacturer/model-specific fault-code lookup and safe troubleshooting, user trust, repeat use and a compelling free experience **before** company licensing/commercialization.
- **Reusable cross-industry Core Engine**: dialogue/intent, retrieval, reasoning, evidence and citation controls, authorization, confidentiality, versioning, safety and tenant isolation. **Company/industry Knowledge Packs** are separate, permission-scoped collections. Archive-first; public-web fallback only when justified and clearly attributed.
- **Hard IP boundary:** filter tenant, document permissions and customer-approved visibility **before retrieval**. Never reveal internal manufacturing methods, trade secrets, proprietary know-how, confidential source documents, contracts, prompts or credentials. Test adversarial retrieval and cross-tenant leakage.
- **Architecture C stays locked:** D1 exact/versioned evidence + Vectorize semantic retrieval + Gemini embeddings/reasoning; Gemini File Search is a selective benchmark candidate, not a replacement by assumption. No parallel competing production retrieval stacks without measured proof.

### B. Live Archive: recovery and acceleration (issue #50; M0–M2)

- **Crash-safe, resumable, incremental ingestion is a release gate**, not a convenience: durable per-document/per-phase Evidence/Raw/Map cursor, partial vector IDs, chunk progress, source fingerprint and version, idempotent replay, atomic checkpoint/write ordering, bounded retries and poison-document isolation. Verify restart **mid-document**, process crash, transport TypeError, duplicate execution, rename/move/delete and superseded fingerprint. Never mark a document complete from a green scheduled workflow alone.
- **Known 2026-10-22 Raw failure:** run [#77](https://github.com/elevatorhelp/elevator-help/actions/runs/39749013600) processed one 35-page/48-chunk document successfully; a 216-page/328-chunk document failed with redacted `TypeError` after 24 chunks were upserted. 20/60 Gemini calls were reserved (not billed usage). Exact cause and recovery of that document **UNVERIFIED**. Investigate first; fix generic transport/retry/checkpoint handling with regression tests before scaling. Do not presume quota exhaustion.
- **2026-10-23 live run evidence:** [scheduled run 39925367077](https://github.com/elevatorhelp/elevator-help/actions/runs/39925367077) completed successfully, Map selected, 2 files attempted, 0 failed, 15/60 Gemini calls reserved; start-of-run pending phase operations: Evidence 134, Raw 188, Map 192 (**514 phase operations, not distinct documents**); eligible 134/72/4. These are **historical log snapshots**, not live D1/Vectorize proof. Four runs/day × two files/run yields at most 8 phase-document completions/day and a ~64-day optimistic floor at this snapshot, before partial files, new uploads or failures; Nov 6 **not feasible at the unchanged theoretical rate**.
- **Acceleration is division of labor, not just increasing MAX_FILES:** route by file type and phase; measure extraction (unpdf, LibreOffice; benchmark MarkItDown, Docling and other mature tools), exact Evidence, Gemini embeddings/Raw, Gemini Map, and D1/Vectorize writes independently. Parallelize only disjoint documents/folders with durable leases, no duplicate writes or quota contention; maintain phase fairness and resume. OCR/layout-aware processing only for detected low-quality/scanned pages, preserving page/section anchors and permission controls. Do not send private/licensed documents to external tools without approval.
- **PDF quality PR #56** is merged; it records extraction-quality checkpoint diagnostics, **not** full OCR or automated recovery. Security PR #57 upgraded Next.js to 16.4.2; [post-merge main Build Check 39922747556](https://github.com/elevatorhelp/elevator-help/actions/runs/39922747556) passed on `9ff085c9e410fe103f8fc37b2086fc97834313bc`. **Production deploy of that exact SHA remains UNVERIFIED.**
- **Google Drive inventory discrepancy:** Oct 22 visible inventory was **240 files (239 PDF, 1 Word)** versus earlier **241 supported-index baseline**. Reconcile Drive discovery, manifest, deleted/renamed files, excluded formats and D1 identity records before quoting archive completion.
- **Decision deadline:** M0 on Oct 23 must choose *A: measured safe throughput increase* (with concrete API cost, capacity, D1/CI limits, rollback and restore evidence) versus *B: re-date M2/Beta with owner approval*. No blind increase in Gemini calls, ingestion schedule, paid service, or production concurrency. Report measured phase operations/day and forecast by Oct 26; M1 proof by Oct 30. Nov 6 remains a target, not a promise.

### C. Backup, local portability and reuse

- **D1 backup AND real restore remain UNVERIFIED.** Test consistent remote backup, checkpoint reconstruction, Vectorize rebuild, and replay after partial ingestion before risky scaling or release.
- Design an **exportable, locally restorable elevator-industry index** for future use: SQLite metadata/exact evidence + portable vector data + manifest, document IDs/versions/languages/pages, embedding-model version, fingerprints and per-phase checkpoints. Test checksum/integrity, export, import, offline retrieval and incremental re-sync; preserve licensing, permissions and privacy. This is a **future deliverable**, not a claim that a working local export already exists.
- **Elevator Agent reuse scope only:** manufacturer and product catalogs, equipment/parts specifications and supplier/producer information; **exclude fault/error codes and engineering calculations** from that exported subset. Include standards only where needed and licensed. The generic Core Engine can be reused independently; do not blend the separate commercial marketplace into elevator.help.

### D. Evidence and acceptance gates

1. **Immediate blocker:** reproduce/classify Raw TypeError, demonstrate exact-document restart and supersession safety, reconcile current Drive/D1 counts and verify restore path. Log sanitized cause categories without exposing filenames/secrets.
2. **Measured extraction/tool matrix:** compare on representative PDFs (digital, scanned, tables, multilingual, long documents) and the Word file; report quality, page fidelity, runtime, cost, privacy and failure rates. Use existing libraries where demonstrably superior; no one-folder special cases.
3. **Gemini File Search:** retain earlier encouraging small-sample grounded answers as *preliminary*, not the 12-case production-grade benchmark. Compare C versus selective File Search on 12 representative public/synthetic cases: correctness, exact clauses/citations, version handling, error codes, latency, cost, privacy and rollback. Only adopt proven selective benefits.
4. **Real-answer gate:** manufacturer/model-specific error-code hotline, accurate standards edition/page/clause, DE/EN/FA follow-ups, permission-safe archive/public-web fallback, and no confidential disclosure. Green CI is necessary but insufficient.
5. **No desktop dependency by default:** GitHub-hosted tests/Actions and connected tools first. Codex Cloud GitHub fetch was blocked by proxy:8080 on Oct 21; support escalation pending confirmation. This is **not evidence** that GitHub scheduled Actions stopped. Request user intervention only for proven access, paid-spend or privileged production changes.
6. **Update this same ROADMAP.md after each milestone** with exact run/PR/SHA, current measured counts, costs, blockers and owner decisions. No autonomous/background completion claims without a verified running automation.

**Current decision:** preserve Architecture C, prioritize Raw recovery and measurable safe Live Archive acceleration, keep Beta/Gamma dates conditional on acceptance evidence, and defer nonblocking feature expansion. This document-only update does not authorize new spend, ingestion runs, production writes or merges without CI.

### M1 / Issue #60 — D1 worker lease verification gate (2026-10-23)

- Draft [PR #61](https://github.com/elevatorhelp/elevator-help/pull/61) adds an **opt-in**, baseline-capped ingestion phase planner; it is **disabled in production**. The restart/checkpoint regression passed Build Check [39941679374](https://github.com/elevatorhelp/elevator-help/actions/runs/39941679374) on commit `f3e49b6`.
- The draft SQL lease/fencing design is in `docs/ingestion-d1-lease-schema.sql`. The SQLite contract regression is `scripts/test-d1-lease-sql.mjs`, added to Build Check on commit `74ae30cb`. **CI on this new commit is not yet verified.** Offline SQLite tests must not be described as actual Cloudflare D1 concurrency tests.
- **Before any production D1 migration, parallel writers or higher throughput:** confirm latest-head CI; implement real atomic D1 claim/renew/complete using owner + generation + expiry and affected-row checks; test simultaneous claims, expiry/reclaim, stale-worker writes and external D1/Vectorize side effects; verify real D1 backup **and restore**, idempotent replay, partial RAW restart and checkpoint recovery. Explicitly verify cache-loss behavior and do not silently rebuild the archive.
- Keep PR #61 Draft and feature flag off until those gates pass. No automatic merge or paid/production ingestion authorization is implied by green offline tests.

#### Cloudflare D1 manual-console evidence — 2026-10-23

- Owner provisioned an isolated D1 database `elevator-help-lease-test-01`; it is **not** the production or preview database. The SQL table `ingestion_worker_leases` was created successfully.
- Four **sequential, manually executed D1 SQL checks** passed based on Console output/screenshots: (1) worker-A acquired `lease-test-01`; (2) worker-B's conflicting upsert left owner A/generation 1 unchanged; (3) simulated expiration allowed B to take over with generation 2; (4) stale A/generation 1 update left B/generation 2 and expiry unchanged.
- Scope limit: these are real Cloudflare D1 queries, **not** two concurrent live workers. The simulated expiry used a synthetic timestamp; it does not prove clock discipline, race-free distributed scheduling, protected Vectorize writes, actual checkpoint restore or safe replay.
- **Next gate:** run a genuinely concurrent acquisition test against the disposable D1 with two independent clients and verify exactly one winner; then add guarded writes/fencing to real ingestion endpoints and test stale-worker side effects, lease expiry mid-request, D1 backup/restore and RAW resume. Preserve feature flag OFF and PR #61 Draft until evidence is complete.

#### Disposable Cloudflare D1 concurrency probe — 2026-10-23

- User supplied GitHub Actions screenshot for manual `D1 lease isolated verification` on `main` commit `d07c422`: workflow `Success`, verify job green, duration 44 seconds. The workflow uses disposable `elevator-help-lease-test-01` and the probe contains two independent asynchronous Wrangler invocations competing for one lease. Screenshot confirms job success; direct job logs have **not** been inspected, so do not claim detailed timing or broader stress coverage.
- Gate satisfied **for one isolated test run only**: concurrent claim result met the probe's assertions. This does **not** prove production safety or continuous multi-worker operation.
- Still required: review logs, repeat/stress concurrency and clock-boundary cases, implement lease validation at every real side-effect boundary (D1 writes, Vectorize upsert/delete), handle expired owner mid-operation and crash replay, verify actual D1 backup/restore, then controlled multi-folder pilot with metrics. PR #61 remains Draft; no production activation.

#### Real Cloudflare D1 Time Travel restore verified — 2026-10-23

- **Isolated database only:** `elevator-help-lease-test-01`. User recorded a Time Travel bookmark before inserting synthetic `restore-test-01` / `restore-probe` into `ingestion_worker_leases`.
- D1 Console showed the synthetic row existed before restore. User restored the isolated database to the saved bookmark via Cloudflare Time Travel and subsequently executed `SELECT COUNT(*) AS remaining FROM ingestion_worker_leases WHERE job_key = 'restore-test-01';`, yielding **`remaining = 0`** (screenshot evidence). This verifies a real point-in-time restore for this test row, not merely that the restore UI is present.
- **Scope limit:** No production database was restored. This does not establish full ingestion checkpoint consistency, Vectorize rollback, archive reconciliation, or production disaster recovery. Those remain release blockers along with stale-worker side-effect fencing and repeated concurrency/stress tests.


## Security dependency invariant — 2026-10-23 (mandatory; never silently downgrade)

- **Next.js minimum approved security baseline: 16.4.2**. This floor is an operational requirement, not an experiment; future dependency changes must preserve or upgrade it. Downgrade is prohibited absent an explicit documented security review and owner approval.
- The repository must keep `package.json` and `package-lock.json` consistent. `scripts/guard-next-security-baseline.mjs` is the CI gate and must run before `npm ci` on main and every PR. Do not delete or bypass this check to fix a compatibility issue.
- A QA-only temporary Next.js 16.3.8 install was used to diagnose an OpenNext integration bug on GitHub Actions; it **did not alter committed dependencies or Production**. It must not become the project's permanent solution.
- Actual Cloudflare QA confirmed Next.js **16.4.2** works with **@opennextjs/cloudflare 1.20.12** (GitHub run https://github.com/elevatorhelp/elevator-help/actions/runs/39987350819). Preferred compatibility fix: upgrade OpenNext with reviewed manifest + lockfile change and repeat exact-head CI; **never downgrade Next.js** to resolve this.
- Until upgraded dependencies are committed and tested, do not infer the temporary QA upgrade is a Production release. PR #61 remains Draft pending separate real Gemini ingestion gates.

## M1 isolated Live Archive acceptance — 2026-10-23 (verified checkpoint)

- **Completed isolated acceptance:** full real Next/OpenNext Cloudflare Worker with Gemini-backed RAW + Map embeddings, immutable exact Evidence, D1 document lease claim/renew, three-layer exact-manifest CAS, bounded read-after-write Vectorize verification, single genuine PDF download from Google Drive (one page/one RAW chunk), and durable one-document checkpoint. Evidence: https://github.com/elevatorhelp/elevator-help/actions/runs/40027136453 .
- **Additional readback and recovery PASS:** after fixing staged-only SQLite fallback, actual remote QA evidence search returned the published Google Drive file/chunk/page; remote D1 rejected incomplete publication, fenced stale owner after lease expiry and permitted successor staging. Evidence: https://github.com/elevatorhelp/elevator-help/actions/runs/40030865522 .
- **Not a production release:** The tested lookup endpoint is QA-only, not a full authenticated user `/api/ask` with Gemini synthesis. Production-safe full-archive migration, automatic source-supersession and crash-safe replay, adversarial multi-worker stress, cost/latency scale benchmarks, permanent OpenNext 1.20.12+ lockfile review, exact-PR-head CI after last docs commit, migration/revert all remain gates. Do not merge PR #61 or enable production staged publication/multi-folder parallelism solely on these QA passes.
- **Next performance phase, no activation until correctness gates:** evaluate **PyMuPDF/MarkItDown/Docling** on a stratified multi-folder sample (digital PDFs, scans, tables, Word, multilingual and standards) and compare extraction fidelity, pages/tables, security/license, failures, per-file seconds and per-1000-page costs. Prefer one-time execution compute over ongoing subscriptions. Then measure safe per-folder sharding with durable lease/checkpoints; never distribute the same document to overlapping workers.


## 2026-10-24 — Live Archive QA reconciliation and release gate (PR #61 Draft)

**Scope:** This ledger records actual QA evidence, not production approval. Existing older milestone statuses elsewhere in this roadmap are historical snapshots. The PR remains Draft; no merge or production feature flag, D1, Vectorize, or Worker activation is authorized.

### Verified isolated QA (do not count as six separately open implementation tasks)
- **Real Drive PDF, one-page pilot, three-layer publication and checkpoint:** [Actions 40027136453](https://github.com/elevatorhelp/elevator-help/actions/runs/40027136453).
- **Real Gemini-backed staging/atomic publication/read-after-publish:** [Actions 40020881922](https://github.com/elevatorhelp/elevator-help/actions/runs/40020881922). Vectorize search readiness was delayed (~99 seconds); readiness is not instantaneous.
- **Real customer-facing exact retrieval of published raw evidence with source/page citation and interrupted-write safety in isolated QA:** [Actions 40031171317](https://github.com/elevatorhelp/elevator-help/actions/runs/40031171317), successful workflow executed on main but explicitly checked out PR #61 source `f44a751f511b4b61fffa7390e746ca08ec5121f0`. It verified incomplete document stays unpublished, lease expiry permits takeover, stale worker is fenced and successor can resume staging. This is not proof of a full post-restart multi-batch completion through production customer /api/ask.
- **Next.js security-floor guard and QA OpenNext build:** passed in the same isolated Actions workflow. A green main-hosted test workflow is NOT itself direct PR-head CI.

### Release-blocking work, ordered and auditable
1. **Long-document multi-batch / resume (OPEN):** execute genuine multi-page (>1 batch) isolated Drive document, automatically acquire and renew lease over long ingestion, persist checkpoint after each batch, force interruption and restart, verify exactly-once logical publication of complete RAW + Evidence + Map, no premature vectors/evidence exposure, correct page citations, no duplicate chunks or old-worker writes, and record exact source SHA/run links.
2. **Bring main into PR #61 safely (OPEN):** inspect divergent history, reconcile security floor Next.js >=16.4.2 and lockfile, OpenNext compatibility, migration changes and overlapping files; never force-update/overwrite independent main work.
3. **Exact-final-head CI (OPEN):** full Build Check, security-floor, core regressions, isolated real app Drive→published evidence→retrieval and multi-batch forced recovery on final PR SHA. Record every run outcome against that exact SHA.
4. **Production readiness (OPEN, separate):** validated D1 backup/restore + migration/rollback, Vectorize consistency and readiness, bounded parallel-worker stress, safe release toggles, costs, whole-archive convergence and failure recovery. A QA pass cannot close this gate.

**Existing PR comparison at 2026-10-24:** PR #61 head `f44a751f` is divergent from `main` (GitHub comparison: ahead 126 / behind 43, not necessarily 43 conflicts), mergeability reported false. Keep Draft while resolving.

**Automation housekeeping:** the stale hourly read-only QA Supervisor (focused on old #53/#54 heads) was disabled because it was not advancing #61. Old development worker already disabled. Six-hour read-only Backfill Watch remains active to detect real scheduled ingestion regression; it does not write code or ingest documents. This is not evidence of an active autonomous coding worker.


## PR #61 execution update — 2026-10-24 (isolated, not release approval)

- Previous real QA PASS evidence: [real Drive single-document three-layer publish](https://github.com/elevatorhelp/elevator-help/actions/runs/40027136453), [Gemini/Vectorize readback](https://github.com/elevatorhelp/elevator-help/actions/runs/40020881922), [real Drive exact retrieval and isolated recovery fencing](https://github.com/elevatorhelp/elevator-help/actions/runs/40031171317). These cover QA scenarios, not full Production readiness.
- NEW offline regression: `scripts/test-ingestion-multibatch-recovery.ts` (commit `3756c410`) exercises two durable receipt batches, lease renewal, simulated crash/expiry, successor generation, stale worker fencing, idempotent replay, exact-manifest rejection, complete publication. Wired into `Build Check` by commit `70b7a094`.
- **Verification status at edit time: UNVERIFIED on GitHub Actions**, no exact-head CI run returned yet; this is offline SQLite contract coverage, **NOT** an end-to-end multi-page Drive→Worker→answer demonstration. Do not mark real multi-batch acceptance complete.
- Remaining blockers: authentic multi-page, multi-batch Drive pilot with persistent file checkpoint and lease renewal across real API calls; crash/restart and full RAW+Evidence+Map completion with verified customer-facing retrieval; merge latest main/security changes without regressions; exact-final-head Build Check and integration CI; isolated migration/rollback and parallel workload stress before production.
- PR stays **Draft**. No merge, Production deployment, production staged flags, paid service upgrades or production D1/Vectorize changes are authorized.


## Execution route when Codex Cloud cannot reach GitHub — decision 2026-10-24

**Decision:** Do not block elevator.help development on Codex Cloud GitHub access. The Codex environment's managed proxy previously caused `git fetch` / `git ls-remote` failure. Use the already demonstrated **ChatGPT interactive engineering → authorized GitHub connector commits on isolated PR branch → GitHub Actions CI/QA → independent evidence review** path. PR #62 enabled manual `Build Check` dispatch on `main` (merge `3a20daf8`), with a successful PR #62 CI run https://github.com/elevatorhelp/elevator-help/actions/runs/40043419703. GitHub connector commits to PR #61 and GitHub PR #62 merge demonstrate this interactive route; these actions do **not** establish unattended autonomous code execution.

**Unattended execution distinction:** GitHub Actions can execute approved workflows, checks, scheduled jobs and isolated integration tests without a desktop. It does not autonomously diagnose and repair code unless a separate coding agent is actually implemented, scoped and verified. An hourly QA/Backfill monitor is observational, never a substitute for a code-writing worker. Do not claim nonstop implementation, self-healing, or overnight completion based on a watch task.

**Required next implementation, separate gated PR:** assess GitHub-native coding-agent options against existing repository permissions, secret isolation and budget; if supported, build one least-privilege, branch-only agent with bounded work/time/cost, auditable diff and logs, human-controlled merge, and fail-closed checks. Start with a disposable PR-only pilot; no production writes, arbitrary shell execution with privileged secrets, uncontrolled loops, automatic main merges, or new paid services without owner approval. If secure autonomous coding is unavailable, continue with interactive GitHub connector edits and CI and explicitly report the limitation.

**Priority remains PR #61:** real multi-page multi-batch checkpoint/recovery E2E, safe main synchronization/security reconciliation, exact-final-head CI and QA evidence; keep PR Draft and Production unchanged pending release gates. Record outcome and URLs here, not only in chat.

## PR #61 verified CI checkpoint — 2026-10-24

- **PASS** on exact commit `8f82959f0e74523bd02e5ad073b7e36df8c8e0d3`: [PR61 Recovery Contract Gate run 40045215724](https://github.com/elevatorhelp/elevator-help/actions/runs/40045215724). All three offline Node/SQLite contract tests passed: multi-batch lease renewal/takeover, full three-layer immutable publication, and complete-document crash recovery.
- **Scope caveat:** offline protocol verification, **not** a real multi-page Google Drive end-to-end pilot nor production recovery acceptance.
- Latest comparison with `main`: diverged, ahead 133 / behind 44 as of review; PR mergeability `false`. Need controlled main reconciliation, conflict resolution and full exact-final-head CI. Do not force push or merge before security review.
- PR #61 Draft; Production untouched. Autonomous code-repair worker not yet implemented; the new workflow runs fixed regression tests only.


## Acceptance pivot: real system operation over repeated offline testing — 2026-10-24

**Owner decision:** stop expanding synthetic/offline QA unless a real defect justifies a focused regression. The next blocking acceptance is one bounded, real, multi-page Google Drive -> scheduled-script-style Worker ingest -> immutable RAW/Evidence/Map -> published-generation readback -> customer-facing question/answer with authentic page citation, including interruption/resume between multiple persisted batches.

**Existing viable harness:** `.github/workflows/qa-pr61-cloudflare-secret.yml` on `main` already deploys the real isolated OpenNext Worker, uses actual Gemini secret held in Cloudflare, drives `scripts/drive-ingest.mjs` for a single Drive document, verifies persisted three-layer checkpoint and exact lookup, and invokes crash/lease fencing. The existing target is one page; repeating that run does NOT close the multi-page gap. Its checkout is pinned to an older PR61 source SHA, so never present it as final-head validation.

**Next real-operation gate:**
1. Choose a permitted, non-confidential real **multi-page** Drive PDF with enough extracted content to force at least two 8-chunk RAW batches (or an equivalently demonstrable multi-batch staged phase); record its page count and extraction output. No assumptions based solely on pages.
2. Run a single controlled QA pilot pinned to the actual PR61 SHA, isolated QA D1/Vectorize/Worker and Cloudflare Gemini secret. Require isolated ingest + map endpoints, bounded Gemini requests/cost and verified no production bindings.
3. Capture persisted per-batch receipts/checkpoint; interrupt after first committed batch; restart with the same file revision and new valid lease; verify no duplicate active generation or partially visible evidence. Require full final RAW+Evidence+Map atomic publication and delayed Vectorize readiness probe.
4. Ask an actual content question through an authenticated customer-facing answer route and verify grounded answer + correct source and page; QA-only exact lookup is necessary but not sufficient for this acceptance.
5. Then reconcile PR61 with latest main, preserving security floor, and execute full exact-final-head CI. Independently verify migration/restore, rollback and bounded multiworker behavior before Production release.

**State:** NOT YET RUN for this enhanced real multi-page interruption pilot; offline Recovery Contract Gate PASS https://github.com/elevatorhelp/elevator-help/actions/runs/40045215724 is supporting evidence only. Keep PR #61 Draft; do not merge/deploy Production or broaden archive access without authorization.


## Monitoring/worker ownership checkpoint — 2026-10-24

- **Current watchers (read-only):** PR61 Final Gate Watch hourly (real multi-page QA and exact-head CI only); Live Archive Backfill Watch every six hours (existing production serial ingestion health only). Their prompts were refreshed to prevent duplicate/stale reports. Neither can write code or trigger Actions.
- **Old coding and QA tasks:** old Development Worker and obsolete #53/#54 QA Supervisor remain disabled. No conflicting autonomous code-writer has been enabled. A GitHub Actions Recovery Contract Gate exists and passed [run 40045215724](https://github.com/elevatorhelp/elevator-help/actions/runs/40045215724), but it runs regression code, not an AI coding agent.
- **Live PR #61 check:** head `b110082b8416497c5923f19fafaaa27551835590`, Draft, mergeable=false; diverged from main (ahead 135, behind 44). These counts are historical comparison markers, not a count of merge conflicts.
- **Only open near-term acceptance:** bounded multi-page Drive single-document source (at least two observed extraction/staging batches), forced interruption and durable restart, complete RAW/Evidence/Map publication, real response with page citation; then main reconciliation and exact-final-head CI.
- Do not claim this gate finished based on another single-page workflow or offline test. No unattended code agent is currently provisioned; automated monitoring is not autonomous implementation. Production stays untouched.

## Engineering / QA responsibility split — 2026-10-24

- **Engineering owner (interactive ChatGPT + authorized GitHub connector):** inspect code, implement corrections and commit to Draft PR #61 only, reconcile with main carefully. No claim of unattended coding after chat ends.
- **QA supervisor (hourly read-only automation):** evaluate genuine CI and isolated real Drive multi-page/batch recovery E2E, exact SHA, security and evidence; report only failures needing attention or verified closure. GitHub Actions runs tests; supervisor does not push fixes or invoke paid workloads.
- **Release gate:** authentic multi-batch resume/readback, merge current main security changes, exact-final-head CI, bounded migration/rollback and review before any Production enablement or merge. PR #61 stays Draft. Do not mistake successful offline contract tests for production readiness.


## Implementation checkpoint — 2026-10-24 (engineering, QA verification pending)

- Implemented in `scripts/drive-ingest.mjs` at commit `6b5841dca4e3b4911ea7a979c6dd4480366ff010`: isolated staged whole-document ingest now saves accepted RAW batch IDs, next chunk index, scanned revision and lease generation to an atomic Drive ingestion state checkpoint **after every successful batch**. A gated `QA_INTERRUPT_AFTER_FIRST_RAW_BATCH=true` switch injects failure *after* the first durable receipt for a controlled QA interruption experiment; it fails closed outside `STAGED_AUTO_LEASE`. The completed document clears transient staged progress on successful atomic publication.
- **Fencing principle:** a new server lease generation must never assume old vectors are reusable. The current QA restart safely replays accepted work under the newly claimed lease. This provides durable forensic batch receipts and a safe injected crash, **not yet efficient same-generation continuation**; the latter requires validated server-side receipt and generation identity.
- This change is engineering work, **not a QA PASS**. QA supervisor must separately run real multi-page Drive pilot twice (injected first-run interruption, then recovery under fresh lease), inspect checkpoints and final RAW/Evidence/Map publication + authenticated answer citation. No Production deployment.
