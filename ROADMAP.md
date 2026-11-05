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


## Security dependency invariant — 2026-10-23 (mandatory; never silently downgrade)

- **Next.js minimum approved security baseline: 16.4.2**. This floor is an operational requirement, not an experiment; future dependency changes must preserve or upgrade it. Downgrade is prohibited absent an explicit documented security review and owner approval.
- The repository must keep `package.json` and `package-lock.json` consistent. `scripts/guard-next-security-baseline.mjs` is the CI gate and must run before `npm ci` on main and every PR. Do not delete or bypass this check to fix a compatibility issue.
- A QA-only temporary Next.js 16.3.8 install was used to diagnose an OpenNext integration bug on GitHub Actions; it **did not alter committed dependencies or Production**. It must not become the project's permanent solution.
- Actual Cloudflare QA confirmed Next.js **16.4.2** works with **@opennextjs/cloudflare 1.20.12** (GitHub run https://github.com/elevatorhelp/elevator-help/actions/runs/39987350819). Preferred compatibility fix: upgrade OpenNext with reviewed manifest + lockfile change and repeat exact-head CI; **never downgrade Next.js** to resolve this.
- Until upgraded dependencies are committed and tested, do not infer the temporary QA upgrade is a Production release. PR #61 remains Draft pending separate real Gemini ingestion gates.


## Beta master execution checklist — proposed 2026-10-25 (review before activation)

**Status:** planning-only, not release authorization. This section supersedes stale task-status summaries *for planning* but does not erase historical evidence. Confirm actual current status against live D1/Drive/Vectorize, exact PR head and production before marking PASS. Beta dates remain conditional.

**Universal-engine invariant:** ONE codebase, ONE generalized ingestion/retrieval/evidence/authorization pipeline, independent of elevator industry, standards series, manufacturer, folder or error code. Each deployment varies only approved source collections, indexes, configuration and permissions. No elevator-specific code paths, EN81 shortcuts, folder-specific fixes or hard-coded test-answer rules. Elevator documents are the first real validation corpus, not a second software architecture. Preserve approved Architecture C.

**Commercial/product constraints:** current GitHub/Cloudflare usage is on free plans per owner; user-facing elevator.help is free for now. API usage and free-tier limits must be measured, not presumed free. No new recurring charges or paid scaling without owner consent. **Like on answers is mandatory for Beta**, with authorization, anti-abuse, privacy and persistence tests. No payments or subscription work in Beta. Jobbörse/vendor marketplace excluded.

**Execution protocol:** GPT authors detailed task/acceptance criteria; manager only dispatches/tracks; Worker implements and self-repairs within approved bounds; independent QA validates; GPT signs off. No automated PASS based solely on green CI. Each task must have exact evidence, owner, status, dependency, test, rollback and blocked reason. Record concise PASS after verified completion. Deferred nonblocking discoveries go to separate TODO; material changes require owner discussion.

### Phase A — reconcile and protect existing work

- [ ] **B01 [P0] Inventory canonical state:** enumerate main SHA, PR #61/#63–70 and other open PRs, issues, local worktrees and uncommitted changes; map overlap, stacked dependencies, obsolete drafts. **PASS:** dated table of heads, conflicts, ownership and merge order, no destructive edits.
- [ ] **B02 [P0] Reconcile security baseline:** preserve Next.js >=16.4.2, lockfile guard, Cloudflare/OpenNext compatibility, fail-closed auth and tenant filters. **PASS:** exact-head CI and security review on intended integration SHA.
- [ ] **B03 [P0] Source/evidence correctness:** versioned document identity, source fingerprint, language, exact clause, physical PDF page, publication visibility, D1/Vectorize identity and stale-generation rejection. **PASS:** independent negative and positive regression suite with primary-source checks, no hard-coded EN81 behavior.
- [ ] **B04 [P0] Merge/release sequence:** resolve PR #61/#63–70 stacks, duplicate implementations and Issue #60 dependencies without bypassing gates. **PASS:** reviewed merge plan, exact-head CI, controlled merge and deployment evidence; close superseded drafts only after verified replacement.

### Phase B — reliable Live Archive and safe parallel indexing

- [ ] **B05 [P0] Live inventory:** compare Drive file IDs/versions and permissions with D1 manifest, Evidence, RAW, Map and both Vectorize indexes; reconcile historical 240 vs 241 discrepancy. **PASS:** fresh timestamped per-phase counts and exception ledger.
- [ ] **B06 [P0] Root-cause RAW partial failure:** diagnose 216-page/328-chunk interrupted example and other transport failures without exposing source secrets. **PASS:** reproducible failure classification and generic regression test.
- [ ] **B07 [P0] Resumable checkpointing:** durable per-document/per-phase cursor, fingerprints, partial vector IDs, idempotent upsert, retries, superseded-revision cleanup. **PASS:** crash/restart mid-document resumes without lost or duplicate publication.
- [ ] **B08 [P0] Durable lease and fencing:** atomic D1 claim, TTL, renewal, owner epoch, stale-worker write rejection and bounded reclaims. **PASS:** two independent workers compete, one loses lease and cannot publish; restart test in isolated environment.
- [ ] **B09 [P0] Atomic publication:** Evidence/RAW/Map stage and commit with immutable generation/CAS, published visibility and no mixed versions. **PASS:** injected failure at every boundary never exposes orphaned or unpublished chunks.
- [ ] **B10 [P0] Backup and recovery:** consistent D1 backup, disposable full-state restore, Vectorize manifest comparison/rebuild/replay, source permission preservation. **PASS:** documented cross-system recovery test, not D1 Time Travel alone.
- [ ] **B11 [P0] Parallel scheduler design:** disjoint document claims (not hard-coded folder rules), phase fairness, backpressure, lease-aware concurrency and retry queues. **PASS:** contention/fairness tests, no duplicate writes or starvation.
- [ ] **B12 [P0] Safe parallel pilot:** run bounded isolated pilot with real ingestion and independent cost/concurrency telemetry; explicitly approve production ramp. **PASS:** measured throughput, quality, failure/retry rates, budgets, rollback and operator stop switch.
- [ ] **B13 [P1] Extraction robustness:** PDFs (long/scanned/tables), Word and multilingual documents, exact page anchors; benchmark MarkItDown/Docling where justified. **PASS:** representative corpus matrix of quality, runtime, privacy and cost; no one-folder-only proof.
- [ ] **B14 [P1] Incremental live sync:** new/changed/deleted/renamed/moved files, same-language variants, duplicate content, revision invalidation and permission changes. **PASS:** repeatable tests over multiple unrelated collections and restart points.
- [ ] **B15 [P1] Archive completion forecast:** daily phase throughput, backlog, API calls, CI/free-tier consumption, cost ceiling and forecast; update Nov 6/13 feasibility. **PASS:** actual metrics and owner-approved revised dates if targets fail; no invented completion percentage.
- [ ] **B16 [P1] Whole-archive coverage:** Evidence, RAW and Map convergence for all supported/authorized files, explicit exceptions and no silent skips. **PASS:** reconciliation report with every excluded/failed item accounted for.
- [ ] **B17 [P1] Retrieval architecture benchmark:** 12 representative public/synthetic cases compare Architecture C to optional Gemini File Search, including citations, edition, multilingual, latency, privacy and cost. **PASS:** documented measured decision; no architecture swap by assumption.

### Phase C — end-to-end Beta product and QA

- [ ] **B18 [P0] Authenticated production answer:** valid signed-in Clerk request to /api/ask, actual approved source edition/page/clause, correct 401 on invalid tokens, no cross-user leakage. **PASS:** redacted live request/response plus independent source verification.
- [ ] **B19 [P0] Generalized technical answer quality:** standards, manufacturer/model-specific faults, catalogs, multi-document synthesis, ambiguity, follow-up and safe troubleshooting. **PASS:** independent golden set across different source types and unrelated identifier patterns, with failure cases recorded.
- [ ] **B20 [P0] Multilingual and fallback:** DE/EN/FA query, same-language source preference when available, language continuity, no fabricated citation, explicitly labeled public-web/general answer. **PASS:** reproducible multilingual end-to-end QA.
- [ ] **B21 [P0] Confidentiality and safety:** approved/customer-visible retrieval only, tenant boundaries before search, secrets and proprietary know-how withheld, safe safety-critical uncertainty. **PASS:** adversarial access and citation tests.
- [ ] **B22 [P1] User experience:** real Clerk signup/login, mobile send/scroll stability, edit/resend, basic accessibility, daily free-user limit policy and informative errors. **PASS:** real mobile/desktop human checklist.
- [ ] **B23 [P1] Mandatory answer Like:** persistent authenticated Like on answer, correct ownership and privacy, duplicate-click/idempotency, abuse protection and deletion handling; no payment dependency. **PASS:** UI + API + storage integration tests and human acceptance.
- [ ] **B24 [P0] Final Beta gate:** exact-head Linux/Node22 CI, independent QA, production smoke, security/cost review, rollback readiness and human owner sign-off; zero critical citation/privacy/data-loss defects. **PASS:** linked PR/SHA/runs and owner acceptance, not merely local synthetic green.

### Deferred TODO — not Beta release dependencies unless owner approves
- Private photo/PDF/Office upload and intent clarification; sandboxed Excel calculations; My Elevator planning; versioned FAQ/learning; SEO; exportable local index for future licensed reuse; broader feedback analytics; autonomous manager/orchestrator implementation; future monetization (only after owner decision). Jobbörse and supplier marketplace belong to separate future product.
- Keep these ideas visible without silently expanding Beta. Any requirement already approved for Gamma remains on the original Gamma roadmap.

### Immediate dispatch order (after owner review)
B01–B04 establish safe integration; B05–B10 establish recovery and evidence correctness; B11–B12 enable parallelism; B13–B17 prove full-archive quality/throughput; B18–B23 prove the actual customer product; B24 closes Beta. Independent read-only inventory, benchmarks and UX tests may overlap only without shared-write conflicts. **No production parallel activation, paid indexing, merge or release is authorized by this checklist alone.**


## Phase 1 owner-assigned delivery board — 2026-11-05

**Status:** owner-requested prioritized To-Do, committed only on the existing planning-only Draft PR #71. This does not approve PR #63 merge, live QA spend, new Cloudflare resources, parallel production activation or any production mutation. The existing M0–M8 goals and historical Beta B01–B24 plan remain; this board establishes the *immediate delivery scope and responsibility* until its acceptance. Reconcile this planning PR with main through ordinary review, and never bypass the release gates.

**Phase 1 goal (both parts are mandatory):**
1. A **real, quota-bounded, crash-safe two-worker parallel archive ingestion service** is safely activated; all supported documents in the agreed archive snapshot reach Evidence + RAW semantic vectors + Document Map, or are accounted for in a verified exception ledger. This includes restart/retry, new/changed/deleted documents, security and exact-citation QA. Merely running two workers, or green offline tests, does not count as completed indexing.
2. The **general-purpose conversational engine** retains context across follow-ups (manufacturer/model/error text), understands mixed-language technical questions without per-OEM/standard shortcuts, and answers in the user's requested or conversational language even when source material and embedded technical error text are in another language. DE/EN/FA/IT are the initial acceptance set; newly added languages must follow the same generic policy.

**Authority, access and cost boundaries:**
- **GPT technical lead (interactive, not an invisible autonomous worker):** collect read-only evidence; plan, review and implement scoped GitHub changes through the connected repository; design tests; coordinate QA; maintain this status board and report true blockers. Only claim execution actually performed.
- **Project owner (human user):** personally handles GitHub/Cloudflare/Google/Clerk account access and secrets through official UIs, limited local-PC tasks following step-by-step guidance, explicitly authorizes any paid Gemini run, production merge/deploy, parallel worker activation, and cost ceilings. Never paste credentials, backup secrets or grant full remote PC control.
- **Code executor:** GPT using permitted GitHub operations in isolated branches; where local testing/agent editing is necessary, **owner-operated local Codex/terminal in a repo-only worktree or Windows Sandbox**, no global filesystem or browser credential access. Codex Cloud is not required while support/proxy issue remains unresolved.
- **GitHub Actions:** executes scoped CI and scheduled ingestion, but cannot sign off on business/safety correctness or autonomously repair source code.
- **Independent QA automation:** stays read-only, reports PASS/FAIL with exact SHA/run evidence; cannot independently authorize merge or production writes. Live Archive Backfill Watch monitors only, not an index worker.
- **No full PC control, new subscription, secrets-in-chat, mass reindex, production changes or new live paid usage without explicit owner approval.** Maintain Architecture C, source permissions, tenant isolation, safety guards, hard Gemini and Cloudflare quotas, and a rollback plan.

### Phase 1 actionable checklist — single critical path with a separate non-mutating language track

| ID | Status on 2026-11-05 | Owner / executor | Acceptance evidence and dependency |
| --- | --- | --- | --- |
| **F1-01 — Establish one authoritative baseline** | IN PROGRESS | GPT lead; GitHub tools; owner only if restricted metrics need UI access | Read current main SHA, PR #63/#74/#76/#71 scope and actual latest CI; capture latest *timestamped* Drive inventory, D1, both Vectorize indices, Evidence/RAW/Map backlogs, eligible vs exceptions, failures, per-phase duration and Gemini/D1 quotas. Never use an Oct/Nov historical snapshot as live status. Output blocker/next step in this same ROADMAP. |
| **F1-02 — Remove isolated-QA credential gate** | BLOCKED | Owner: inspect official Actions secret and manual workflow settings; GPT: exact workflow diagnosis and guidance | Nov 2 actual-app QA runs #41496215316 and #41430366539 failed at \`Validate isolated credentials\` with \`Paid QA opted in but Gemini key missing\`. Confirm whether \`GEMINI_API_KEY\` is available to the selected workflow; for negative-only QA do not select paid opt-in. No credential disclosure. Rerun the **appropriate** negative-only path first and paid positive path only after owner grants a bounded budget. |
| **F1-03 — Finish PR #63 reconciliation** | IN PROGRESS / NO-GO | GPT GitHub code executor; independent QA validates; owner reviews release | Compare required #61/#69/#74 content without double-merging stacked PRs, retain main security floor Next.js >=16.4.2, ensure PR #63 exact-final-head CI, scoped security/cost review and protected release process. Green offline Build #40966756214 is evidence of build, **not** positive live E2E. No merge pending F1-04. |
| **F1-04 — Real isolated end-to-end release gates** | BLOCKED ON F1-02/F1-03 + OWNER AUTHORIZATION | GPT drafts harness/tests, GitHub Actions executes, independent QA verifies; owner supplies legitimate test session and explicitly approves bounded paid resources | Genuine signed Clerk customer \`/api/ask\` with correct standards edition/clause/physical PDF page; multipage Drive interruption and exact resumable checkpoint; stale lease/fencing & duplicate prevention; complete Evidence/RAW/Map publish; remote isolated D1 backup/restore and reconciliation with **two** physical Vectorize indices; cost/concurrency/rollback evidence. Secrets must not appear in logs/chat. |
| **F1-05 — Controlled release of proven integration** | BLOCKED ON F1-04 | GPT prepares candidate/release checklist; owner explicitly approves merge/deploy; independent QA checks post-release | No unsafe duplicate PR merges; protected branch/required checks or equivalent reviewed release discipline; backups and rollback verified; production signed-in smoke and source citation PASS; record deployed commit SHA. |
| **F1-06 — Measure and repair phase fairness/capacity** | NOT STARTED (PR #76 DRAFT) | GPT + scoped code executor; GitHub Actions CI; independent QA | Review PR #76 vs actual main/PR #63 for six-hour scheduling starvation, persistent per-phase cursor, failures/restarts and cache durability; measure actual files/phases/day, D1 rows and quota headroom, Gemini calls/cost, API errors; choose safe worker budget by measurement, not simply raising MAX_FILES. No production increase yet. |
| **F1-07 — Two-worker isolated parallel pilot** | BLOCKED ON F1-04/F1-06 | GPT designs lease/queue/worker changes and acceptance tests; GitHub Actions isolated QA; owner approves any billed resources | Both workers demonstrably operate concurrently on **different** eligible documents with atomic D1 lease+fencing, heartbeat, idempotent checkpoints, expiry/reassignment, crash recovery, fingerprint and version fencing, fair Evidence/RAW/Map scheduling, no premature publication/duplicate billable writes, verified quotas and isolated D1+dual Vectorize restoration. Keep bounded stop/rollback switch. |
| **F1-08 — Production parallel activation** | BLOCKED ON F1-07 + EXPLICIT OWNER GO | GPT prepares deployment + rollback + metrics; owner clicks/approves sensitive releases; Actions runs guarded schedule | Two workers actually progress simultaneously under cost/row/write/latency thresholds; backups, pause switch and staged rollback proven; monitor latest run IDs, completed/failed documents and all three queues. Stop on safety/cost ceiling breach. |
| **F1-09 — Finish archive parallel backfill** | BLOCKED ON F1-08 | GitHub Actions ingestion workers; GPT compares reconciled daily progress; owner checks exception sign-off | Reconcile all Drive supported items vs indexed file IDs/versions/langs; all agreed snapshot's eligible Evidence/RAW/Map phase work completed, remaining exclusions explicitly classified/approved; confirm real semantic and exact page/clause retrieval across multiple manufacturers, standards and folders. New uploads continue incrementally; do not call completion based on empty eligible counts if orphan/stale index remains. |
| **F1-10 — Fix generic multilingual conversation and answer-language policy** | NOT STARTED (existing bug #75) | GPT technical design + isolated GitHub code executor; independent QA; owner supplies real-world prompts | Implement explicit \`responseLanguage\` and conversation slot state rather than assuming retrieved manual or quoted German fault text determines reply language. Priority: explicit user request > reliable latest user message > maintained conversation language > UI locale fallback. Source excerpts never change language preference. Preserve manufacturer/model/fault text/editions across turns; ask only for missing info; avoid per-language, per-OEM or EN81 hardcoded answer patches. Existing \`زیلابگ\` alias is already recognized: fix continuity, not spelling. |
| **F1-11 — Evaluate ready-made i18n/identification libraries; multilingual real QA** | NOT STARTED | GPT researches, scoped code executor benchmarks, independent QA validates, owner performs human FA/DE/EN/IT mobile conversations | Use existing supported Next.js i18n tooling only when it helps UI locales; evaluate \`next-intl\` or i18next for interface, and lightweight language identification for long ambiguous text, but **never confuse UI localization with LLM answer-language/slot management**. Test short user turns, Persian maker alias + German exact error, code switches, Italian manual answered in FA, German standard answered in IT, explicit language override, missing fault identifier, manufacturer ambiguity, failure/fallback. Preserve technical quotations exactly; explanation remains target-language. Record reproducible pass/fail matrix and regressions. |
| **F1-12 — Final Phase 1 acceptance and handoff** | BLOCKED ON F1-09/F1-11 | Independent QA issues evidence, GPT audits against checklist, owner performs live mobile sign-off | Two real safe parallel workers + recovery, fully reconciled snapshot with 3 phases or signed exceptions, real source-grounded technical answers, no critical privacy/normative/citation issues, multilingual same-language and follow-up acceptance PASS, measured cost/performance and restoration, owner explicit Phase 1 DONE. Only then activate next Gamma scope. |

**Active dispatch limit:** F1-01 → F1-02 → F1-03/F1-04 → F1-05 → F1-06 → F1-07 → F1-08 → F1-09 is the archive release critical path. F1-10/F1-11 may be designed/tested independently without modifying production or competing with ingestion release changes. F1-12 closes both streams. Record test run, exact SHA, evidence and owner/action in ROADMAP after every *verified* completion; avoid repeated speculative tests.

**First owner-guided action:** open GitHub repo Settings → Secrets and variables → Actions, verify the existence/visibility (not the value) of \`GEMINI_API_KEY\` for the manual PR #63 QA workflow. Do **not** paste it here. The explicit paid opt-in must be off for negative-only checks. The technical lead will then choose the precise safe workflow parameters and validate the result before requesting any billed run.

**Schedule reality:** the earlier 2026-11-06 whole-archive gate is a target **not supported by measured safe throughput** at four runs/day × two phase-document operations/run. Do not claim it will be met or silently revise commitments; record a revised date/effort after F1-01/F1-06 measured throughput and owner review.

**Hotline / Codex Cloud:** pending support response is not a blocker for GitHub connector review, GitHub-hosted isolated QA or owner-operated manual actions. Escalate a genuine missing capability only with a specific error and constrained requested action.


### Phase 1 execution ledger — 2026-11-05 (credential mapping and CI)

- **F1-02 source mismatch diagnosed and code-fixed, E2E validation PENDING:** the repository's existing owner-confirmed \`GEMINI_BENCHMARK_API_KEY\` is now bound as process env \`GEMINI_API_KEY\` in both locations in the isolated PR63 actual-app QA Workflow. PR77 staged the fix, then the identical one-file blob was committed directly on canonical Draft PR63 as commit \`1709190c9f9c7bf0a572e1d025cd76ad16c07911\`; PR77 closed as a redundant stacked draft **without separately merging**. No secret value copied, no main/Production change, no Gemini paid run.
- **Exact new PR63 head Build Check PASS:** https://github.com/elevatorhelp/elevator-help/actions/runs/42018845550 — completed success on \`1709190c9f9c7bf0a572e1d025cd76ad16c07911\`, including actual Next.js/Cloudflare Worker build and offline safety checks. This is NOT actual-app Cloudflare E2E.
- **Next owner task (human, limited UI only):** manually dispatch existing \`PR61 actual application isolated E2E\` on \`integration/pr61-reconciled-20261024\`, \`allow_isolated_d1_mutation=true\`, \`allow_paid_gemini=false\`; inspect exact-head execution, QA-only D1/dual Vectorize resources and negative-only E2E outcome. This consumes isolated Cloudflare quota and writes to QA-only D1, but no paid Gemini invocation and no production mutation. GPT reviews run ID and diagnoses any failure. Do not run with paid=true until separately authorized and cost budget agreed.
- **PR63 release remains Draft / NO-GO:** positive E2E, Clerk signed citation, multipage Drive interruption/recovery, remote D1 + both physical Vectorize restore/reconciliation, security/cost/rollback and user release authorization remain mandatory. F1-03/F1-04/F1-05 not complete.


### Phase 1 execution ledger — 2026-11-05 (remote Wrangler startup diagnosis)

- **Run #42019839447 (exact PR63 head \`1709190c9f9c7bf0a572e1d025cd76ad16c07911\`):** owner-dispatched negative-only actual-app isolated E2E completed FAILURE at \`Execute actual route against isolated Cloudflare\`. All preceding gates PASSED: exact-head/ref, QA-only resource config, npm ci, \`GEMINI_BENCHMARK_API_KEY\` mapping/credentials, pinned Next.js+OpenNext, real worker build, isolated remote D1 bootstrap and lease schema preflight. The local \`wrangler dev --remote\` process exited before port 8787 became reachable; readiness status HTTP 000. Raw startup logs were intentionally withheld, so the precise underlying cause **remains unknown**. This was not evidence of a Gemini request failure.
- **Safe startup classifier fix:** Three files were developed on temporary stacked PR #78 and copied byte-for-byte into canonical Draft PR63, exact commit \`0c94bdb036eed617b08865c1c9caa0e9183a3252\`. New \`scripts/qa-pr61-classify-startup.mjs\` maps local private Wrangler log to a fixed classification; the workflow calls it on startup failure; existing safety test asserts bounded non-disclosing output. Raw Wrangler output must never be printed, uploaded or persisted as GitHub Actions artifact. PR78 was CLOSED without separate merge.
- **Exact-final-head Build Check PASS:** https://github.com/elevatorhelp/elevator-help/actions/runs/42021137586, completed SUCCESS on \`0c94bdb036eed617b08865c1c9caa0e9183a3252\`. This is static and offline CI plus Next.js/Cloudflare build; no repeat of the real Cloudflare QA test occurred after the classifier fix.
- **Next restricted owner action:** manually dispatch the QA workflow on \`integration/pr61-reconciled-20261024\`, \`allow_isolated_d1_mutation=true\`, \`allow_paid_gemini=false\`. Cloudflare QA quota and QA-only D1 can be used; no paid Gemini mode, no production writes. GPT to inspect the new workflow run, read the **fixed diagnostic category only**, then diagnose/repair the actual startup cause. **Do not rerun the previous stale SHA.**
- **Release remains NO-GO:** no actual-app E2E completion, live Clerk-signed citation, interrupted multipage Drive resume, isolated D1+both Vectorize restore/reconciliation, production rollback, cost/concurrency evidence, or owner approval. F1-04 not DONE.


### Phase 1 execution ledger — 2026-11-05 (Vectorize remote QA preflight)

- **Exact-head isolated actual-app run #42022051076:** negative-only manually dispatched, completed FAIL after isolated D1 bootstrap/lease schema success, on PR63 SHA \`0c94bdb036eed617b08865c1c9caa0e9183a3252\`. Safe diagnostic emitted \`QA_WORKER_STARTUP_QA_RESOURCE_OR_BINDING\` and HTTP 000; the private Wrangler log was correctly withheld. This is a coarse class **not proof of which resource or binding is absent**. No paid Gemini usage or production deployment reported by this run.
- **Specific next diagnostic:** added \`scripts/qa-pr61-verify-vectorize-readonly.mjs\` which uses only \`wrangler vectorize get --json\` against the **two allowlisted QA-only indexes** in \`wrangler.qa-app.json\` (never vector records), with captured stdout/stderr and fixed status codes, and a manual-only workflow gate after \`npm ci\` / OpenNext build but **before remote QA D1 mutation**. Exact config and ordering covered by offline regressions; no surprise index creation, deletion, upload, data export or paid Gemini calls. A lookup failure can reflect **missing index OR insufficient API token read permissions**; do not automatically create an index based on it.
- **PR63 integrated code SHA:** \`21c0502dbea08b9880600905a176ae550fe58cbd\`. [Exact-head Build Check #42023364311](https://github.com/elevatorhelp/elevator-help/actions/runs/42023364311) COMPLETED SUCCESS. The new remote probe itself has **not been run**; Build Check cannot prove actual Cloudflare resources exist.
- **Owner next action:** from GitHub Actions manually run \`PR61 actual application isolated E2E\` on exact PR63 branch \`integration/pr61-reconciled-20261024\`, \`allow_isolated_d1_mutation=true\`, \`allow_paid_gemini=false\`. This allows QA-only resources / Cloudflare quota, not Production or paid Gemini. Report the new run URL; GPT checks \`QA_VECTORIZE_LEGACY_*\` and \`QA_VECTORIZE_MULTILINGUAL_*\` fixed statuses and corrects the established cause before any further tests. No additional manual run until this one has been diagnosed.
- **Release:** PR63 remains Draft / NO-GO; real E2E, restoration, signed-in citation, parallel ingestion and multilingual product fixes are not declared complete.


### Phase 1 execution ledger — 2026-11-05 (multilingual QA Vectorize lookup)

- **New verified run:** manually dispatched negative-only [PR61 actual-app isolated E2E #42024575441](https://github.com/elevatorhelp/elevator-help/actions/runs/42024575441) completed FAIL on exact PR63 head \`21c0502dbea08b9880600905a176ae550fe58cbd\`. QA build, credentials, exact-ref verification and resource config guards PASS. Added **read-only** metadata preflight: \`QA_VECTORIZE_LEGACY_METADATA_OK\` for \`elevator-help-staging-test\`, but \`QA_VECTORIZE_MULTILINGUAL_LOOKUP_FAILED\` for \`elevator-help-staging-test-v2\`. The fail-closed preflight stopped **before** remote D1 bootstrap and Worker startup. This is evidence of unsuccessful index lookup, **not** proof of index absence or bad API permissions separately.
- **Root-cause branch to resolve with owner:** On the same Cloudflare account as \`CLOUDFLARE_ACCOUNT_ID\`, open Cloudflare dashboard's Vectorize indexes list **read-only**. Check exact name \`elevator-help-staging-test-v2\`, dimension/metric if present, and whether the first legacy QA index is visible. Do not create/delete/edit any index or token before establishing absence vs permission/account mismatch. If the index exists in the correct account, inspect scope/Vectorize Read permission of the GitHub Cloudflare token (only in official UI; never reveal tokens in chat). If absent, review a minimal **QA-only** creation plan with correct multilingual embedding dimension (768) and metric, account free-tier index limit and owner approval before creating; avoid touching production indexes.
- **Next action owner**: return screenshot or status (both index names listed / only legacy / neither) from Cloudflare Vectorize overview. **GPT**: compare metadata with approved QA config and prepare the minimum necessary safe correction; then one authorized repeat. **No further blind workflow dispatch now.**
- **Phase 1 state:** F1-04 BLOCKED; PR63 remains Draft NO-GO. No paid Gemini mode, production change, merge or new index creation from this diagnostic.
