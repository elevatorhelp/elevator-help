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


## Codebase and PR structure cleanup — planned, mandatory before PR61 release (2026-10-24)

**Goal:** reduce the growing PR #61 review surface (139 commits / 46 changed files as observed in GitHub UI), remove accidental complexity and duplication, and preserve functional Live Archive work. This is planned engineering work, **not yet completed**; do not conflate cleanup with QA verification.

1. **Inventory and safeguard:** enumerate current PR61 changed files, divergent commits, GitHub main changes, outstanding workflows and ownership boundaries; snapshot exact immutable SHAs. Never delete/rewrite history or force-push the original PR61 branch. Preserve all existing changes before splitting.
2. **Scope and architecture:** classify changes into (a) ingestion/checkpoint/leases, (b) isolated real-Drive QA and operational workflows, (c) answer/retrieval and security compatibility, (d) documentation. Define explicit module boundaries and one durable source of truth for checkpoint, receipt, revision and generation.
3. **Non-destructive PR decomposition:** make small, independently reviewable branches based on current main where safe; cherry-pick/reapply only verified relevant patches, preserving attribution/evidence. Do not merge overlapping work into main until exact-head checks pass. Keep PR61 Draft as an integration/reference branch until replacement coverage is confirmed.
4. **Code cleanup:** remove provably redundant code, duplicate workflow logic, stale pinning and outdated comments; consolidate config, improve types/error handling, avoid per-file hacks and hidden feature flags. No behavior changes without focused evidence. Production and paid API settings stay untouched.
5. **Operational acceptance first:** prioritize a real multi-page multi-batch Drive→isolated QA D1/Vectorize→atomic publish→authenticated customer answer with citation, including interrupted resume. The QA supervisor owns test evidence; engineering owns fixes.
6. **Gates:** security-main reconciliation, migration/restore/rollback, bounded costs and concurrency, full exact-final-commit CI, independent QA approval; document each PR and run link. No auto-merge or Production release before all gates.

**Acceptance criterion:** smaller reviewable PRs, no lost features, no new coupling or regressions, all required real-world E2E evidence; close or supersede original PR61 only with explicit documented feature parity and safe merge strategy.


### Regression suite consolidation and removal policy — 2026-10-24

- A historical PASS is **not** justification to delete a regression guard. Keep fast required CI coverage for security baseline, standards/citations, checkpoint/lease/fencing/crash consistency and production safety boundaries.
- Inventory every test script and GitHub Actions workflow before changes, link each to a distinct invariant and its most recent actual evidence; flag duplicate, superseded, isolated-pilot-only, obsolete and unreferenced checks.
- Consolidate redundant assertions into one maintained canonical suite and remove only provably covered or obsolete scripts/workflows after checking import references, CI matrix, deployment hooks, branch protections and historical troubleshooting needs.
- Retain authentic integration E2E as a distinct acceptance gate; do not repeat paid, real-document ingestion on every small commit. Run bounded real QA for release candidates or changes affecting ingestion, mapping, citation, recovery or compatibility.
- Preserve historical run URLs and outcomes in the evidence ledger. Small fast tests run on every PR; slow/paid QA is isolated and manually dispatched or otherwise gated. No deletion/disablement of required protection until replacement is proven on exact SHA.
- Deletions and suite consolidation are **planned, not yet executed**. QA supervisor validates test equivalence and no coverage regression.


### PR #63 non-destructive integration checkpoint — 2026-10-24

- Pushed independent branch `integration/pr61-reconciled-20261024` from clean PC worktree following a verified repository+working-files backup; opened **Draft [PR #63](https://github.com/elevatorhelp/elevator-help/pull/63)**, commit `a15bba58b93493e7210e1217a651f1d8f2a5a3a9`. Original #61 remains Draft/unaltered. Merge preserved PR61 content and main's main-push Vectorize QA provisioner; both original content conflicts resolved.
- Validated local merge index and clean worktree. Installed exact lockfile dependencies with `npm.cmd ci --ignore-scripts` (no changes to PowerShell execution policy). **PASS** local `npm run test:incremental-ingestion` covering quota stops, queue fairness, checkpoints and fingerprint guards; **PASS** `npm run test:security` and `npm audit --omit=dev --audit-level=moderate` (zero production-dependency vulnerabilities). Full audit still reports 8 findings in dependency tree (2 moderate, 6 high), apparently OpenNext/AWS/minification transitive path; must review, no automated forced updates.
- **Full exact-head Build Check** for PR63 triggered: https://github.com/elevatorhelp/elevator-help/actions/runs/40048779686 . At this entry it is **in progress**, not yet a PASS.
- Remaining: independent full CI final head; actual multi-page interrupted real Drive QA and authenticated answer; dependency/security review, migration/rollback and bounded multi-worker stress, safe small PR decomposition. PR63 is an integration candidate, **not** a release authorization.


### Live Archive integration and split execution ledger — 2026-10-24

- **Non-destructive main reconciliation:** [Draft PR #63](https://github.com/elevatorhelp/elevator-help/pull/63), originally derived from commit `a15bba5` on verified PC GitHub mirror, preserving original Draft PR #61, no force push or production writes.
- **Root-cause engineering fix:** missing-`archive_chunk_search_fts` error had been misclassified as a missing `archive_chunk_search` base table because a fallback regex matched the table-name prefix. Added a table-name boundary to both catches in `app/lib/archive-evidence-index.ts`, and removed an unnecessary D1 schema preflight from the request hot path. [Exact-head Build Check 40049204972 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049204972); newer [Build Check 40049531403 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049531403) at QA-workflow commit `c780b93`.
- **Runtime crash/resume improvement (QA isolated only):** `scripts/drive-ingest.mjs` now atomically saves Evidence IDs + per-RAW-batch receipts/next chunk + fingerprint + full lease identity; only resumes old RAW batch IDs after server-confirmed renewal of exactly the same owner/generation. Otherwise attempts a new generation, never reusing stale staged IDs. A controlled fault-injection exit follows the first durable RAW batch. This has offline Build Check coverage but is **not** itself proof of actual remote recovery.
- **Real multipage pilot started (PENDING final outcome):** [QA Workflow run 40049525992](https://github.com/elevatorhelp/elevator-help/actions/runs/40049525992) on isolated Cloudflare QA Worker, dedicated QA D1/Vectorize and a real multi-page manufacturer brochure from authorized Google Drive, with bounded Gemini calls. Workflow exercises first-batch interruption → durable state → same-lease resume → full RAW+Evidence+Map publication → page-specific protected QA lookup. Distinguish protected QA exact lookup from authenticated customer-facing `/api/ask`; the latter is NOT proven by this run. Workflow is triggered only by its own file update, not by ongoing scheduled ingestion.
- **Small Draft PR decomposition:** [#64 Lease primitives](https://github.com/elevatorhelp/elevator-help/pull/64), base main, with [focused contract PASS 40049624059](https://github.com/elevatorhelp/elevator-help/actions/runs/40049624059) and [Build Check PASS 40049631945](https://github.com/elevatorhelp/elevator-help/actions/runs/40049631945); [#65 Publication CAS/visibility](https://github.com/elevatorhelp/elevator-help/pull/65), stacked on #64, with [focused contract PASS 40049769325](https://github.com/elevatorhelp/elevator-help/actions/runs/40049769325). Neither was merged; full Build Check of #65 must be revalidated after safe retargeting/integration. All original code/history preserved. No test deletion until invariant-equivalent coverage is verified.
- **Security and dependency caveat:** isolated PC `npm run test:security` PASS; `npm audit --omit=dev --audit-level=moderate` returned 0 production vulnerabilities. Full npm dependency tree reported 8 findings (2 moderate, 6 high) largely tool/dev transitive dependencies; no `npm audit fix --force` or Next.js downgrade. Assess risk before release.
- **Outstanding release gates:** final real multipage QA verdict and source/page evidence; authenticated customer-answer synthesis, true production-safe D1 restore/rollback and checkpoint/Vectorize reconciliation; parallel concurrency and bounded cost in production; exact final SHA full CI, independent QA/security review and explicit deployment authorization. Original PR61 remains Draft; main/Production unchanged.


### VERIFIED real multibatch Live Archive acceptance — 2026-10-24

**QA environment / strict scope:** [GitHub Actions run 40049525992 — PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049525992), source commit `c780b93e6b38e8d2e3cc2390f17c135323fa5cc8`; GitHub-hosted protected Cloudflare QA app using isolated D1 and Vectorize, real Google Drive manufacturer brochure, capped Gemini calls; NOT Production.

**Measured facts from completed job logs:** PDF had **8 pages** and **10 RAW chunks**. First invocation successfully durably wrote at least one 8-chunk RAW receipt, injected an intentional crash *after* checkpoint, and verified incomplete generation was not marked published. Restart used a server-confirmed renewed lease for **the same generation** (log: `QA resumed verified same-generation durable checkpoint`), continued the remaining RAW work and generated **21 Document Map nodes**. Atomic RAW+Evidence+Map publication completed with consistent revision/fingerprint checkpoint. The protected QA exact-evidence retrieval returned the real Drive source and correct page citation. Additional QA lease expiry/stale-owner takeover check PASS. All steps of run completed SUCCESS. No fabricated or document-specific search patch was used. This establishes an actual bounded two-batch crash/resume demonstration, **not** whole archive convergence or Production readiness.

**Separate evidence and scope:** [full Build Check 40049531403 — PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049531403) on source commit `c780b93`; later documentation updates require final-head CI revalidation. Real QA exact-evidence lookup was a **protected QA-only API**, not an authenticated customer-facing `/api/ask` Gemini response. Do not declare customer conversational answer acceptance complete.

**Safe small-PR extraction progress:** [Draft #64 lease](https://github.com/elevatorhelp/elevator-help/pull/64) — focused contract [40049624059 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049624059) and full [Build Check 40049631945 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049631945); [Draft #65 staged CAS/visibility](https://github.com/elevatorhelp/elevator-help/pull/65), stacked on #64, [40049769325 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40049769325); [Draft #66 full three-layer publication](https://github.com/elevatorhelp/elevator-help/pull/66), stacked on #65, [40050021371 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40050021371). These do not yet cover the full runtime/API/Drive orchestrator integration. No PR has been merged, and original PR61 remains intact/Draft.

**Still-open mandatory gates:** authenticated customer `/api/ask` QA, production D1 backup/restore and safe migration rollback including Vectorize replay, final merged-head CI after safe stacked PR reviews, bounded parallel-worker stress and cost/privacy/security review. Production and main have not been modified by this work.


### PR #65 cross-document receipt isolation hardening — 2026-10-24

- **Concrete gap fixed on the existing Draft stacked PR #65, NOT main/Production:** `recordStagedBatch` previously accepted a valid lease for document A while inserting staged RAW receipts under a different `documentId`. Final publication already checked the document identity, so this was not proof of a published cross-document leak; it was nevertheless an unauthorized staging write and violated per-document lease isolation. The helper also accepted empty/oversized receipt IDs.
- **Implementation:** [commit f2566f6](https://github.com/elevatorhelp/elevator-help/commit/f2566f6bbcf200bd8dd3df4d1cb20b23cb320076) rejects mismatched `lease.jobKey/documentId` before D1 writes and requires 1–8 distinct nonempty string IDs of at most 512 characters. [Test commit 97bbe3a](https://github.com/elevatorhelp/elevator-help/commit/97bbe3a7f8906dbdf41aeb5c6afa2b3ea2d96b92) asserts cross-document and malformed IDs leave the staging table unchanged, then runs the existing generation/CAS/crash tests.
- **Exact-head focused CI PASS:** [Isolated Publication Protocol Check 40054534449](https://github.com/elevatorhelp/elevator-help/actions/runs/40054534449) completed SUCCESS at PR #65 SHA `97bbe3a7f8906dbdf41aeb5c6afa2b3ea2d96b92` (GitHub Actions API checked). This is Node22/SQLite contract coverage, **not** real D1 concurrent QA, authenticated `/api/ask`, or full integration Build Check.
- **Stack integration pending:** PR #66 remains based on older PR #65 SHA `99d1e847` and therefore does not yet contain this guard. Reconcile non-destructively into #66 (no rebase/force-push) and require fresh exact-head focused CI; preserve both Draft PRs. The existing PR #63 integration branch also predates the fix. Independently review downstream callers for the same document-identity contract before release.
- **Still blocked:** authenticated customer answer with source/page citation under normal Clerk auth, isolated full D1 checkpoint restore/rollback and Vectorize reconciliation, bounded multi-worker stress, final integrated exact-head full CI/security review, and explicit owner release approval. No production ingestion, paid QA, private archive export, merge or deploy was performed in this correction.


### PR #66 non-destructive stack reconciliation and dependency CI — 2026-10-24

- **Completed:** [merge commit 3ca55797](https://github.com/elevatorhelp/elevator-help/commit/3ca55797adf07c2afb02fcb8b91f1a189735e3e3) advanced the existing Draft PR #66 branch with both parents preserved (previous #66 `f2fa72b3` and updated #65 `97bbe3a7`). GitHub compare confirmed the two #65 changes (staged receipt guard + test) and the four #66 full-publication additions were **disjoint** before constructing the merge tree. No rebase, reset, force-push or main merge. This **resolves the prior stack-pending note** for #66; PR #63 still predates the new guard.
- **CI dependency gap closed:** [commit 3c006979](https://github.com/elevatorhelp/elevator-help/commit/3c006979c652d10c07cb4f7a804c8065dffa75f7) updates the isolated full-publication workflow so a change to the generation receipt helper/test triggers the gate and executes both the generation-CAS and complete RAW/Evidence/Map CAS contracts. [Exact-head Isolated Complete Publication Check 40054669979 — PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40054669979), SHA `3c006979c652d10c07cb4f7a804c8065dffa75f7`. This is focused Node22/SQLite QA, not full Next.js/Cloudflare integration CI.
- **Remaining integration gate:** bring this proven guard into PR #63 without losing main reconciliation, then require full Build Check and independent review on its final exact SHA. The authenticated customer `/api/ask` evidence gate, real D1/Vectorize restore/rollback and bounded concurrency/cost/security acceptance remain OPEN. All original PRs remain Draft; Production unchanged.


### PR #63 integrated document-scoped receipts + full CI — 2026-10-24

- **Integrated without history rewriting:** [PR63 commit 4ba21430](https://github.com/elevatorhelp/elevator-help/commit/4ba2143068713f3219746e29babab595dbced5f2) brings the already-focused-tested PR65 guard and negative tests into the non-destructive main-reconciled Draft integration branch. Prior PR63 content and main security changes are preserved; no Production or main merge.
- **Exact-code-head full Build Check PASS:** [Actions 40054748856](https://github.com/elevatorhelp/elevator-help/actions/runs/40054748856) completed SUCCESS on SHA `4ba2143068713f3219746e29babab595dbced5f2`, including standard repo Build Check. Prior [PR65 focused PASS 40054534449](https://github.com/elevatorhelp/elevator-help/actions/runs/40054534449) and [PR66 dependency-inclusive focused PASS 40054669979](https://github.com/elevatorhelp/elevator-help/actions/runs/40054669979) remain independent supporting contracts.
- **Gate status:** source isolation defect fixed across #65, #66 and #63, but this is **not** an authenticated customer-answer E2E, actual D1 restore/Vectorize rollback, adversarial multi-writer test, or Production release. Current ROADMAP documentation update changes PR63 HEAD again; require fresh exact-HEAD CI before any merge. All PRs remain Draft; no paid pilot repeated.


### Map receipt manifest validation hardening — 2026-10-24 (CI pending)

- **Verified code gap:** `recordStagedMap` accepted an array containing empty, whitespace-only, oversized, null or numeric map receipt IDs because it checked only count and uniqueness. Those values could reach the D1 staged-map receipt insert under an otherwise valid lease; this does **not** prove any cross-document publication or customer data leak.
- **Small Draft #66 change:** [guard commit 90cc1f8](https://github.com/elevatorhelp/elevator-help/commit/90cc1f832b5abff1286ccd23947082aa9ef7e895) validates an actual array of 1–100 distinct, non-blank string IDs each at most 512 characters **before** lease checks or D1 writes. [negative test commit 4225292](https://github.com/elevatorhelp/elevator-help/commit/4225292bd0b932186ab8a740b5963636e25ea822) covers malformed entries and asserts no staged map rows remain. No migration, endpoint, paid API or Production change.
- **Non-destructive integration in Draft #63:** [guard commit 0529e94](https://github.com/elevatorhelp/elevator-help/commit/0529e94ffec5b971582c355364d6acfa4a95dd98) and [regression commit ed05d7c](https://github.com/elevatorhelp/elevator-help/commit/ed05d7c934845acd933a99e727bb93060a3eaf61). The original Draft #61 and existing stack history are untouched. The two files have identical content blobs in #66 and #63 at these code checkpoints.
- **QA status:** [PR #66 exact-head Isolated Complete Publication Check 40058567602 — PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40058567602), SHA `4225292bd0b932186ab8a740b5963636e25ea822`, verifies both receipt dependency and three-layer publication contracts with malformed-ID negative tests. [PR #63 Build Check 40058614925](https://github.com/elevatorhelp/elevator-help/actions/runs/40058614925) started on documentation SHA `f2f7562c148f3676df96e9985cf24b5936c414ea` and was **in progress when checked**, not a PASS. This new evidence-ledger commit will move PR63 HEAD again; require a new full Build Check PASS on the final SHA and independent read-only QA. Remaining mandatory gates are authenticated Clerk-protected customer `/api/ask` with real page citation (not a QA-only lookup), isolated D1 restore/rollback with Vectorize consistency, bounded concurrency/cost/security review and explicit release authorization. All PRs remain Draft; no main merge or Production deployment.


### Customer-authentication and QA-edge security gate — 2026-10-24

- **Verified boundary:** `workers/qa-real-app-entry.mjs` requires the disposable QA bearer token AND explicitly allows only POST `/api/drive-ingest-batch`, `/api/document-map-ingest` and `/api/qa-evidence-lookup`. A public `/api/ask` is NOT reachable through this isolated ingestion QA Worker. Moreover `wrangler.qa-app-deployed.json` sets `AUTH_REQUIRED=false`; therefore prior verified source/page lookup is **not** a valid Clerk-authenticated customer answer demonstration. Do NOT relax the QA edge allowlist or claim the lookup is an authenticated chat result.
- **New fail-closed CI regression:** `scripts/test-qa-ingestion-edge-guard.mjs` committed in PR63 at `edabb758`; Build Check now runs it before normal request-auth regression (commit `6d6b2cc0`). It checks the disposable worker’s explicit allowlist, token gate, POST restriction, and absence of `/api/ask`. This is source-level protection, **not** an actual Clerk session test. Exact-head [Build Check run 40059792070](https://github.com/elevatorhelp/elevator-help/actions/runs/40059792070) was still in progress when recorded; final result must be checked.
- **Remaining genuine positive-auth gate:** Exercise an actual registered session's Clerk-signed Bearer token through a trusted production-equivalent `/api/ask` instance with `AUTH_REQUIRED=true` and valid Clerk settings; prove response contains real current Drive source, correct page/citation and safe handling, plus reject missing/invalid tokens. The existing ingestion QA Worker must stay closed to `/api/ask`. Do not transmit private session tokens into GitHub logs or weaken `AUTH_REQUIRED` to make QA green.
- **Restore / rollback scope:** Previously verified Cloudflare Time Travel restored a disposable D1 lease-table synthetic row. That is **not** a full recovery drill of publication manifests, checkpoint state, Vectorize consistency, or Production. Require independent isolated restore/bookmark rehearsal and a production rollback runbook reviewed without deleting/restoring production data. This remains OPEN.
- **Release controls:** Original PR61 and integration PR63 remain Draft. No merge or Production deployment until positive-auth proof, full recovery drill and security approval are complete.


### Auth fail-closed and restore rehearsal execution — 2026-10-24

- Verified **real production negative-auth smoke** against `https://elevator.help/api/ask` using authorized PC curl: POST without Bearer token returned **HTTP 401**, and POST with the deliberately invalid `Bearer invalid-qa-test-token` also returned **HTTP 401**. No actual customer account token was accessed or printed, and no paid Gemini answer was requested. This is a negative-auth check only; a valid Clerk test session and source-grounded response are still required.
- Created independent Draft [PR #67](https://github.com/elevatorhelp/elevator-help/pull/67), code/test head `9149573e105f639899416b1217465ce46bb93229`, to fail closed when `AUTH_REQUIRED` is missing/mistyped. It preserves intentional explicit `AUTH_REQUIRED=false` opt-out for separately authorized contexts, and adds missing-flag/typo negative tests. Its [Build Check 40060082866](https://github.com/elevatorhelp/elevator-help/actions/runs/40060082866) must pass at exact head before approval. Original PR61 unchanged, PR67 not merged.
- Added PR63 `scripts/test-ingestion-restore-roundtrip.mjs` with a deterministic local staged-publishing SQL snapshot→loss→restore and exact equality checks for the active generation, RAW receipts, exact Evidence and Map receipts; wired it into Build Check. [Full CI 40059935906](https://github.com/elevatorhelp/elevator-help/actions/runs/40059935906) passed on code head `08add54dcaff870ce3c09ba01c1110a31a39789d`. This **does not** replace a real Cloudflare D1 Time Travel full-state restore or Vectorize consistency recovery.
- New `docs/PR61-RELEASE-AND-ROLLBACK.md` defines guarded deployment, real signed Clerk answer/citation acceptance, D1 full-restore and Vectorize consistency gates, emergency feature disable, rollback and release-owner approval. [Exact-head CI 40059978503](https://github.com/elevatorhelp/elevator-help/actions/runs/40059978503) passed on `95b4b594bc55b542853e5eddfca5f889401f6480` including source QA boundary regression and local restore.
- **Dependency audit:** fresh `npm audit --omit=dev --audit-level=moderate` found zero Production dependency advisories on the isolated locked tree. Full audit showed eight development/toolchain/transitive alerts (six high, two moderate), concentrated in OpenNext/AWS/minifier, body-parser/glob and Wrangler/Miniflare/Undici. Do not accept an `npm audit fix --force` suggested downgrade blindly, especially against approved Next.js 16.4.2 floor.
- **Still mandatory:** real valid Clerk-signed answer via `/api/ask`, isolated actual D1 full restore with Vectorize manifest reconciliation, exact-head independent security and deploy approval, stacked PR review/merge. No Production restore/deploy or merge was carried out.


### Real disposable Cloudflare D1 full-publication Time Travel restore — VERIFIED 2026-10-24

- **Real remote PASS**: [GitHub Actions run 40060248285](https://github.com/elevatorhelp/elevator-help/actions/runs/40060248285), workflow `.github/workflows/qa-pr61-d1-restore.yml`, execution SHA `c94bbf0da91e00c5abeba39d71d331ff95ab3366`. A fresh, uniquely named disposable Cloudflare D1 database was created with quota guard, real staged schema applied, a three-layer publication fixture inserted (active generation 2; RAW/Evidence/Map receipts), its actual Time Travel bookmark captured, generation advanced to 3 with replacement receipts, and **actual Cloudflare Time Travel restore** invoked against that bookmark. Verified after restore: active generation 2, exactly one RAW receipt, one Evidence row, one Map receipt, and zero superseded generation-3 RAW receipts.
- Cleanup step passed: only that run's uniquely named disposable D1 database was deleted; no production or shared QA D1 was restored or deleted. No Gemini API calls, private archive import, Production Worker deployment or main merge in this restore drill. Cloudflare's official Time Travel documentation states backup/restore history incurs no additional charges; routine tiny D1 query/write usage is still subject to the owner's account plan and quotas.
- **Meaningful advancement:** This is remote full-publication manifest recovery evidence, beyond the earlier one synthetic lease-table row and offline SQLite roundtrip. **Still not verified:** full Production snapshot integrity for the actual evolving archive/checkpoint database, Vectorize-to-restored-D1 consistency and stale-vector visibility after rollback, authenticated customer `/api/ask` positive signed Clerk proof, concurrency stress, and independent release/security approval. Do not treat this QA result as permission to restore Production.
- Separate Draft [PR #67](https://github.com/elevatorhelp/elevator-help/pull/67) fail-closed auth change: [exact-head Build Check 40060082866](https://github.com/elevatorhelp/elevator-help/actions/runs/40060082866) **PASS**, source SHA `9149573e105f639899416b1217465ce46bb93229`. Two real Production negative-auth probes (no token / invalid token) were both HTTP 401; positive auth user session proof remains OPEN.


### Production restore readiness and Vectorize stale-data safety — 2026-10-24

- **Read-only Production Cloudflare D1 Time Travel PASS:** [run 40060492335](https://github.com/elevatorhelp/elevator-help/actions/runs/40060492335), source SHA `e30866e954be0c199a739cbacd3eca815bbc5bed`. The GitHub workflow validated real production database `elevator-help-cortex` remote metadata access, obtained and validated a fresh Time Travel bookmark *without printing its value*, and ran read-only `archive_chunks` counts. No production D1 restore/DDL/DML, Vectorize mutation, migration, deployment or merge occurred. Initial read-only run 40060432916 failed because it assumed an undocumented version field in Wrangler JSON; corrected to use real Time Travel bookmark evidence. This does not prove a full consistent multi-system Production restore.
- **New concrete retrieval/rollback defect mitigated:** Previously `filterPublishedMatches` treated *any* D1 query error as permission to surface legacy vector matches; after a D1 outage this could expose superseded vectors despite an active generation. PR63 commits `73058733`, `59d98879`, `710f1226`, and `4aedb07f` narrow the fallback to a positively identified missing publication table (pre-staging schema). Transient D1 errors fail closed, while deliberately unconfigured legacy-only deployments retain prior behavior. Commit `dd9c2625` adds the explicit D1 Time Travel rollback regression (generation 3→2 fences lingering generation-3 Vectorize results). The final exact-head [Build Check run 40060720436](https://github.com/elevatorhelp/elevator-help/actions/runs/40060720436) was in progress at the time of writing. Do not claim it passed without checking.
- **Gates still requiring independent proof or user participation:** Legitimate signed-in Clerk customer `/api/ask` citation and manufacturer/version/page match, live multi-system Vectorize reconciliation after D1 rollback, final exact-head CI after all PR updates, independent security review including 8 dev-chain npm advisories, and controlled explicit release/merge approval. No unauthorized production changes.

### PR #67 fail-closed customer-auth integration into Draft PR #63 — 2026-10-24

- **Reproducible security gap:** PR #63 previously inherited `process.env.AUTH_REQUIRED !== "true"` in `app/lib/request-auth.ts`, so an unset or misspelled authentication flag silently opted out of Clerk authentication. This is unsafe for any accidentally misconfigured production-equivalent deployment; it does **not** establish that live Production was misconfigured.
- **Already isolated and independently tested:** [Draft PR #67](https://github.com/elevatorhelp/elevator-help/pull/67), code SHA `9149573e105f639899416b1217465ce46bb93229`, [exact-head full Build Check 40060082866 PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40060082866). Its two-file change requires **explicit** `AUTH_REQUIRED=false` to opt out and adds missing/mistyped-flag negative tests. Normal `AUTH_REQUIRED=true` still requires a Clerk-signed token and a configured secret.
- **Integration change in [Draft PR #63](https://github.com/elevatorhelp/elevator-help/pull/63):** copied the **identical reviewed blob contents** of `app/lib/request-auth.ts` and `scripts/test-request-auth.ts` from PR #67 onto the main-reconciled integration branch, preserving PR #61/#67 and their history; no force push, no Production deployment, no merge. This closes the known missing-flag opt-out in the integration candidate rather than leaving it as an unintegrated downstream patch.
- **Validation rule:** Require **new exact-head PR #63 Build Check PASS**, independent security review and actual valid Clerk-session `/api/ask` grounded answer before approval. The PR #67 PASS is supporting evidence, not substitute for integration CI. Two live negative-auth 401 checks and QA-only evidence lookup do not satisfy positive authenticated-customer citation proof.
- **Remaining:** actual signed-in Clerk answer with page citation, isolated multi-system D1/Vectorize rollback/replay evidence, bounded concurrency/cost and explicit owner-approved release. All original Draft PRs and main/Production remain untouched.


### Staged exact-evidence citation metadata validation — 2026-10-24

- **Reproduced from code review:** `stageExactEvidence` previously checked only nonempty receipt ID/fingerprint and matching document lease; it accepted blank/oversized IDs and non-positive/fractional page or negative chunk index. The upstream ingestion route required integer page/index but did not require positive page or nonnegative index. An invalid staged evidence page could therefore be published and used as a false page citation. No actual customer-facing leak or malformed production row has been observed.
- **Bounded Draft PR #63 fix:** validate nonblank receipt ID and source fingerprint (max 512 chars), positive safe-integer page and nonnegative safe-integer chunk index **before any D1 write**; preserve the existing cross-document lease rejection and immutable-row CAS. Added negative SQLite contract cases for malformed IDs/fingerprints/page/index and verified no staged evidence rows are created by rejected inputs. These checks match `scripts/drive-ingest.mjs`'s existing 1-based page and 0-based chunk generation; no ingestion rate, paid API, production schema, routing or user auth change.
- **Verified code+roadmap exact-head CI PASS:** [Build Check 40066923170](https://github.com/elevatorhelp/elevator-help/actions/runs/40066923170) completed SUCCESS at [commit `cd8674e60`](https://github.com/elevatorhelp/elevator-help/commit/cd8674e60dfefaf7ebee1c12607e3bd1f6fec088). The three-layer atomic RAW/Evidence/Map publication test (including the new malformed-evidence negative cases), standard Next.js build, Cloudflare Worker build and all other Build Check steps passed. This subsequent evidence-only ROADMAP update changes the PR head, so final exact-head CI and independent QA must still be rechecked before any merge.
- **Still OPEN:** signed-in Clerk customer `/api/ask` source/page answer; multi-system D1/Vectorize rollback/replay; bounded concurrent-writer/cost/security review; explicit owner release approval. Original Draft PR61 and stacked Draft #64/#65/#66/#67 remain untouched; no main merge, Production mutation or paid QA was performed.


### Fail-closed Vectorize visibility with configured D1 — 2026-10-24

- **Reproducible publication-visibility gap:** `filterPublishedMatches` previously admitted unversioned legacy Vectorize matches when a D1 binding existed but lacked a working `prepare` method, or when a vector omitted `sourceFileId`. In those cases it could not check the active published document generation; after a rollback or metadata loss this could resurface superseded source content. This is a code-level fail-open path, **not evidence of a Production data leak**.
- **Isolated review:** [Draft PR #68](https://github.com/elevatorhelp/elevator-help/pull/68), head [`5f6d8c9`](https://github.com/elevatorhelp/elevator-help/commit/5f6d8c928f42500f381b4817a036178e53a4c7b0), adds a two-file bounded guard and negative regression tests. Legacy-only retrieval is preserved only when D1 is deliberately absent and strict mode is off; configured unusable D1 or missing source identity now fails closed.
- **Actual focused test:** Node.js 22.16.0 `node --experimental-strip-types scripts/test-ingestion-publication-visibility.ts` **PASS** in an isolated offline harness. The two tested file bytes were verified identical to PR #68 Git blobs: `03db88b7bec08a1e68b8ce747bc964e48395747d` (visibility module) and `f0fa9d6d2e91bf374d8dcfb55e9005e2c4b667e6` (regression test). This is a local contract PASS, **not** GitHub CI or remote D1/Vectorize proof.
- **Integrated and verified:** the identical two reviewed Git blobs were integrated non-destructively with this ROADMAP entry on Draft [PR #63](https://github.com/elevatorhelp/elevator-help/pull/63), code+ledger [commit `b3d56fb`](https://github.com/elevatorhelp/elevator-help/commit/b3d56fb31706762f11b4e4989259eb0f78986c57). **Full exact-code-head [Build Check 40071086521 — PASS](https://github.com/elevatorhelp/elevator-help/actions/runs/40071086521)** at that SHA (including visibility contract, standard Next.js and Cloudflare builds). This subsequent evidence-only ROADMAP update changes PR63 HEAD again, so recheck final exact-head CI and independent read-only QA before acceptance. Original Draft #61 and independent Draft #68 preserved. No Production D1/Vectorize write, main merge, private document transfer, paid Gemini call, schema change or force push.
- **Still mandatory:** real Clerk-signed customer `/api/ask` with correct document/page citation, live D1/Vectorize restore/reconciliation, bounded concurrency and cost/security review, stacked PR review and explicit owner-approved release.


### Full-publication Map completeness fail-closed — 2026-10-24

- **Reproducible contract gap:** `publishFullGeneration` previously permitted `mapIds=[]` while RAW and Evidence were nonempty. The atomic D1 CAS could therefore activate a generation with **zero Map receipts** (the SQL count comparison accepts 0=0). The caller's Vectorize readiness loop also has no Map IDs to verify in this case. This is a potential incomplete document-map publication, **not** evidence that Production actually published an incomplete generation.
- **Bounded implementation on existing Draft [PR #63](https://github.com/elevatorhelp/elevator-help/pull/63):** [guard commit 8352c34](https://github.com/elevatorhelp/elevator-help/commit/8352c34a828dcb3241d5869f0c9504c8742bb1e0) rejects an empty Map manifest before any D1 operation; [negative regression commit fc03fb2](https://github.com/elevatorhelp/elevator-help/commit/fc03fb2ebb4bc388ba48dd3ba440aa2c9f931984) asserts rejection and unchanged active generation with otherwise valid RAW and Evidence. No new workflow, migration, feature flag, paid Gemini call, Production write, main merge, or change to the original Draft PR #61.
- **Validation:** [full Build Check 40074415163](https://github.com/elevatorhelp/elevator-help/actions/runs/40074415163) was started for exact code SHA `fc03fb2ebb4bc388ba48dd3ba440aa2c9f931984`; status **not yet confirmed PASS** at this ledger entry. This ROADMAP-only commit changes the integration PR head, so require another exact-final-head Build Check PASS and independent read-only QA before approval. The previously proven real Drive pilot generated 21 Map nodes; no paid pilot is repeated.
- **Still mandatory before release:** valid Clerk-signed customer `/api/ask` with real source/page citation, live multi-system D1/Vectorize rollback/replay, bounded concurrent-writer and cost/security review, and explicit owner release approval. Preserve all original Draft branches, keep Production unchanged, and do not equate this narrow guard with whole-archive readiness.

### Authenticated customer-answer release harness — 2026-10-24

- Added `scripts/qa-authenticated-ask-citation.mjs` on Draft PR #63, commit `5a1e0b3027a9c64ba79a4d009f5fe163b764317d`, and syntax check in Build Check, commit `4e24aa708cb8f40652ea7b7b4ff8ffff5a578460`.
- The harness makes **actual HTTPS requests to /api/ask** and requires negative 401 for absent/invalid bearer sessions, a positive 200 with an existing **legitimate Clerk-signed test session**, a nonempty user answer, a verified-answer mode, and the configured actual page/source citation. It uses environment variables `QA_ASK_BASE_URL`, `QA_CLERK_SESSION_JWT`, `QA_ASK_QUESTION`, `QA_EXPECTED_CITATION`. It never prints session credentials or answer bodies. It does not forge session tokens or disable production authentication.
- **Not executed yet:** no authorized signed-in test account/session JWT was available to this run. Unit auth checks and earlier two production negative 401 probes are not positive customer E2E proof. Need a legitimately obtained short-lived Clerk test session in a secured runner or an owner-supervised signed-in browser demonstration before declaring this gate complete; do not solicit a real user's token through chat.
- Other gates still open: validated cross-system rollback of D1 and Vectorize, security review and explicit merge/release authorization. No Production mutation or PR merge.

### Generic standards retrieval root-cause fix — 2026-10-24

- **Reproducible code defect identified:** in `app/lib/cortex-standards-engine.ts::searchEvidence`, **any** exact EN standard-identifier hit previously set `backends=[]`, skipping all semantic retrieval. A broad introduction/catalog chunk mentioning EN 81-20 could therefore suppress the topical car-roof-guard clause even though no evidence in the exact result answered the question. The evidence compiler then returned insufficient, routing the answer to web fallback. This is a confirmed code-level failure path, **not yet proof that it alone caused the owner's production sample**; live archive index availability and actual route remain to be measured.
- **Applied generic correction** at commit `0a1da43df41403cbe4b30d8f6dabe6de1b542bb0`: continue semantic retrieval even when broad exact matches exist; do not weaken standard/document source match or quote/numeric claim verification. Added code-path executable regression in `scripts/test-cortex-standards-topic-retrieval.mjs` and Build Check gate, ending at commit `12f7a2f35ebde18e4760e43dbdd86ae7b18fc2cb`.
- **CI evidence:** exact-head Build Check https://github.com/elevatorhelp/elevator-help/actions/runs/40078897470 was running at the time of this entry; do not claim success until completion verified. No Production deployment, main merge or paid public Gemini calls.
- **Remaining acceptance:** verify real indexed EN 81-20 document/edition and topic page in Archive; retest signed-in customer response on release candidate; ensure correct 5.4.7.2 outer roof-edge trigger vs 5.4.7.4 inner handrail-edge height distinction; enforce accurate source provenance. User example's "Quelle: Web-Recherche" still constitutes **NOT VERIFIED** internal source.


### Standards semantic generation visibility — 2026-10-24

- **Reproducible source-path gap:** `app/lib/cortex-standards-engine.ts::searchEvidence` merged unfiltered Vectorize matches directly with D1 exact evidence. It did not apply the existing `filterPublishedMatches` generation gate to semantic hits. A stale `gN:` vector remaining after D1 Time Travel rollback could therefore reach the Gemini standards evidence compiler, even though the active D1 generation had changed. This is a code-level risk, **not evidence of a Production leak**.
- **Bounded code correction:** [commit 7d688032](https://github.com/elevatorhelp/elevator-help/commit/7d6880323d2f2a44757a298c5e97968e231bfae0) gates semantic Vectorize matches against the existing D1 publication identity before compiling standard claims. D1 exact evidence remains governed by its own published-generation SQL. Deliberately unconfigured legacy-only deployments retain the existing visibility compatibility; staged vectors cannot be served without D1. No schema change, paid API call, Production mutation, merge or force-push.
- **Regression:** [commit 2e7d610](https://github.com/elevatorhelp/elevator-help/commit/2e7d610714771af3b7f9698f2faa59501fd0c89e) extends the executable topic retrieval test: a broad exact EN 81-20 hit still permits topical semantic retrieval, but a superseded staged vector must be removed by the publication gate before entering standards evidence. The separate visibility contract already tests real generation-3-to-2 rollback behavior. **Exact-head CI is pending and must be verified against the final roadmap-updated commit**, not assumed from prior green runs.
- **Still open before any merge/release:** authenticated real Clerk customer `/api/ask` with true edition/clause/page citation; EN 81-20 indexed source identity and edition confirmation; live cross-system D1/Vectorize rollback reconciliation; independent security and cost/concurrency review; final exact-head CI; explicit release approval. PR61, PR64–68 and PR63 remain Draft, main/Production unchanged.


### Standards retrieval VM dependency repair — 2026-10-24

- **Verified failure:** [PR #63 Build Check 40082787281](https://github.com/elevatorhelp/elevator-help/actions/runs/40082787281) on the then-current PR merge ref failed at step "Test standards topic retrieval despite broad exact hits": `ReferenceError: filterPublishedMatches is not defined` in `scripts/test-cortex-standards-topic-retrieval.mjs:36`. The isolated `vm.runInNewContext` harness extracts `searchEvidence` without TypeScript imports, but the production function now invokes the generation publication gate. All earlier steps passed; downstream checks/build were skipped. This is a **test harness dependency failure**, not evidence that the production filter itself failed.
- **Bounded repair:** [commit 680b5cc](https://github.com/elevatorhelp/elevator-help/commit/680b5cc96e2816e0c75361eb24d86417bf0baccb) injects an explicit publication-gate mock into the isolated VM, counts gate invocations, and excludes the superseded vector fixture. The existing assertions demand topical retrieval, exactly one gate call, and absence of superseded evidence. Dedicated `test-ingestion-publication-visibility.ts` exercises the actual gate implementation; this mock does not substitute for that separate test.
- **Gate status:** code change committed on Draft PR #63; **exact-final-head CI still pending**, as this roadmap-only evidence commit will advance HEAD again. No main merge, Production write, private archive export or paid API call.
- **Still blocked for release:** legitimate signed-in Clerk customer `/api/ask` with verified EN 81-20 edition/clause/page citation; isolated D1 restore and Vectorize reconciliation/rollback proof; security/concurrency/cost review, independent QA, dependency-safe stacked PR reconciliation, explicit release authorization.


### Source-bound standards page citations and release QA gate — 2026-10-24

- **Reproduced code-level gap:** `app/lib/cortex-standards-engine.ts::formatAnswer` emitted standard and clause but omitted the source page, even when D1/Vectorize evidence contained a page. The signed-in customer QA harness also allowed any response mode except four disallowed values, meaning `internal_evidence` or another non-standards mode could falsely satisfy an EN 81-20 release check merely by echoing the expected text.
- **Bounded integration fix:** [commit d5dc74c7](https://github.com/elevatorhelp/elevator-help/commit/d5dc74c7d82e674d28ede351d554e6a201109713) carries a source page into `VerifiedStandardClaim` only from selected retrieved evidence metadata, requiring a positive safe integer; the model cannot choose a page. The customer-facing standards citation now prints the page when present (German `S. N`, Persian `صفحه N`, otherwise `p. N`), without displaying private filenames/paths. This does **not** validate document edition or invent a page when source metadata is absent.
- **Deterministic regression:** [commits 6467635b and 79dabd7](https://github.com/elevatorhelp/elevator-help/commit/79dabd7bf22cc714896f96a799691919331176d4) extend the existing executable standards-topic retrieval test with the actual verifier and formatter, checking page 91 from source metadata despite model-supplied 999, rejection of page zero, and no private source path in the formatted answer. The shared VM-context correction is included in the latter commit.
- **Customer QA hardening:** [commit 360de353](https://github.com/elevatorhelp/elevator-help/commit/360de353d34d86ce2e9170173aea887dbebd28a5) requires actual `standards_verified` mode and a positive displayed source page before a legitimate Clerk-signed `/api/ask` response can pass. It retains missing/invalid token 401 assertions, requires the configured exact citation and does not print tokens or response bodies. This is **harness code only**; no real signed-in customer session was available and no paid request was made.
- **Gate status:** the changes above are committed on Draft [PR #63](https://github.com/elevatorhelp/elevator-help/pull/63), not merged. The new exact-final-head Build Check and independent read-only QA are **PENDING**; passing prior heads is insufficient. No production D1/Vectorize write, private archive export, live Gemini pilot, branch deletion, force-push or main merge.
- **Still required before closure:** verify actual EN 81-20 archive edition and source-page mapping, run positive legitimate Clerk-session citation QA in a secure authorized environment, demonstrate isolated cross-system D1/Vectorize rollback and replay consistency, review bounded concurrency/cost and security, reconcile stacked PR #61/#64–68 without duplicate merges, obtain exact-head CI plus independent QA and explicit safe release approval, then deploy/verify Production before closing superseded Drafts and Issue #60.

- **CI correction:** [Build Check 40090465832](https://github.com/elevatorhelp/elevator-help/actions/runs/40090465832) on the ledger-updated head `b2ef1660` passed the expanded executable standards-topic/page regression, auth harness syntax, publication tests and other earlier steps, but failed at TypeScript build: `TS18047: selected.page is possibly null` in the new page guard. [Commit e31daf85](https://github.com/elevatorhelp/elevator-help/commit/e31daf85fefe5bde585b9dcf8e2aed877f573528) explicitly narrows `selected.page` to `number` before checking positive safe integer; no behavior change beyond the intended nullable-page validation. A fresh exact-final-head CI PASS remains REQUIRED and has not yet been established at this ledger entry.

- **Exact code+ledger head CI PASS:** [Build Check 40090658377](https://github.com/elevatorhelp/elevator-help/actions/runs/40090658377) completed SUCCESS at `4bb7a7653ad7f788b1cfdeba5f0e9b39f66f0e7a`, covering the real verifier/formatter source-page regression, signed-in QA harness syntax, TypeScript/Next.js build, Cloudflare Worker build, and other Build Check steps. This evidence-only ROADMAP update itself advances the PR head and must receive its own exact-head CI before release. It does not replace independent QA or actual authenticated production proof.
- **Drive source discovery, not ingestion proof:** a metadata-only authorized Google Drive search on 2026-10-24 found a candidate `DIN EN 81-20, 11-2014-DE.pdf` and several EN/DE 81-20 PDFs in the living archive. A filename alone does not establish document edition content, index status, page/section identity, or the active published generation. No PDF bytes were exported or sent to the model, and no paid pilot was run. The real source/edition/page customer citation acceptance gate remains OPEN.


### PR #68 malformed staged-ID visibility guard — 2026-10-24

- **Concrete code-level gap:** invalid generation-qualified Vectorize IDs (`g0:chunk`, padded `g01:chunk`, oversized generation, or empty suffix) returned null from `parseStagedId` and were then treated as legacy hits. Under a deliberately absent D1 binding or missing publication row, this could bypass generation-based visibility checks. This is a defensive correctness finding; **no Production leak is claimed**.
- **Bounded fix:** Draft [PR #68](https://github.com/elevatorhelp/elevator-help/pull/68), [commit `6e55cf3c`](https://github.com/elevatorhelp/elevator-help/commit/6e55cf3c2290ba6e696bc71782e2b78933b00a9b), rejects malformed staged prefixes before legacy fallback; adds deterministic negative tests for configured/unconfigured D1 and absent publication. No Production changes, secrets, paid calls, migrations, or merge.
- **Exact PR #68 head CI PASS:** [isolated visibility safety run 40098513798](https://github.com/elevatorhelp/elevator-help/actions/runs/40098513798) completed SUCCESS at `a3bb1b6c7b6a0d6f844f27c52dfec71977a2eb9c`, including the rollback visibility test. This **does not** prove a real D1/Vectorize restore or customer EN 81-20 citation.
- **Archive discovery:** metadata-only Drive search confirms multiple EN 81-20 candidate PDFs, including a named German 2014 copy and English variants. Filename/metadata alone do **not** verify document edition contents, published generation, indexed page, or customer-facing source provenance. The live EN 81-20 edition/page gate stays OPEN.
- **Closure remains blocked:** real signed Clerk customer `/api/ask` answer with true source/version/clause/page; isolated cross-system D1/Vectorize restore/replay; independent QA, concurrency/cost/security review, stacked PR reconciliation, final exact-head CI, explicit safe release authorization, and Production validation. Preserve Drafts and Issue #60; no main merge, deployment or Production D1 restore.

### Bounded local PR61/Issue60 closure iteration — 2026-10-24

- Exact baseline and unchanged committed HEAD: `3bec95cefb2cd06663db53d5fc4a11f4d557b042` (PR63). Local uncommitted fix: standards verifier now requires exact parsed clause membership; production-engine regression failed before (4.2 accepted from 4.20), passes after across numeric/nested/annex negatives and an unseen-source exact positive. CI command added locally; no Actions triggered.
- Static security baseline, focused regression, offline generation visibility, published exact evidence, full/complete publication, multibatch recovery, SQLite restore, compact index, clause parsing/casing, QA edge guard and document identity PASS on Node24.19.0. Auth and several standards harnesses blocked by missing dependencies; staged QA guard fails on missing unpdf; baseline cortex test fails a source-wide regex on an existing comment; backfill requires a verified export. Offline dependency install failed EPERM; TypeScript retry failed ENOTCACHED; Next build failed missing next. No fake green, Node22 CI remains owner-deferred.
- Actual /api/ask auth and metadata-to-D1/Vectorize-to-formatter path inspected. Legitimate Clerk-session positive and actual EN81-20 edition/clause/page identity remain unverified; source fingerprints are carried but do not independently establish edition applicability. No cloud/paid calls, production/private archive access, remote writes, commits, merges or deployments.
- Reconciliation plan: fetch/record actual main and PR61/63/64–69 heads later; compare ancestry/patch equivalence; reconcile #64 lease, #65 receipt/generation and #66 full publication dependencies, confirm #67 auth equivalence, review all later #68 visibility fixes and independently inspect #69 QA scope. Preserve histories and avoid duplicate integration. No local origin/main ref exists; conflicts and current remote heads are unverified.
- **NO-GO for merge/deploy/closure:** restore dependencies and pass local types/build/blocked checks, exact-final-head Node22 CI when owner resumes it, primary-source EN81-20 edition/page proof plus real signed-in answer, live isolated D1/Vectorize restore/replay reconciliation, independent heterogeneous/security/concurrency/cost QA and owner release authorization remain required. Full evidence and actionable plan: `PR61-CLOSURE-ITERATION-2026-10-24.md`.


### 2026-10-24 — PR61/Issue60 closure gate addendum (local, not released)

- Isolated clean worktree `elevator-help-PR61-GATES-20261024`, committed baseline SHA `3bec95cefb2cd06663db53d5fc4a11f4d557b042` (PR63). No commit/push/merge/deploy or production changes this iteration.
- Proven standards citation bug: claim clause `4.2` could be accepted from source containing only `4.20`; corrected exact parsed clause membership in production verifier, with failing-before/passing-after synthetic production-path regression. Preserved general identifiers and source-page provenance.
- Fixed two pre-existing offline test-harness mismatches: VM clause parser now returns complete numeric clause tokens; exact document hit still triggers necessary semantic topic retrieval (budget expectation 3, not 2). Source comment no longer trips a source-wide fixed-standard allow-list test. No safety assertion disabled.
- Permanent local dependency change `@opennextjs/cloudflare` 1.20.10 -> 1.20.12 (package.json + lockfile), following prior isolated compatibility QA. Local `npm ci` successful; `npm run cf:build` PASS with Next.js 16.4.2/OpenNext 1.20.12; local Next build PASS; `tsc --noEmit` PASS; auth, standards, clause collision, topic retrieval, RAW/Evidence/Map publication, generation visibility, SQLite restore, security baseline and npm production-dependency audit PASS (0 vulnerabilities). These are Windows Node24 local checks, NOT exact-final-SHA Linux Node22 CI or real deployed Worker validation.
- Read-only Google Drive metadata confirms multiple candidate EN81-20 files/editions, including two different Drive IDs with identical English filenames. No primary-source content, edition/page/clause or live D1/Vectorize indexing verified; private Drive IDs retained only in local out-of-repo notes.
- GitHub read-only snapshot: PR61 Draft and nonmergeable; PR63 Draft mergeable at `3bec95c` with historical exact-head Build Check PASS, but these NEW local changes have NO CI; PR64–69 remain Draft/open, and PR68/69 have distinct follow-up changes. Do not merge or close based on old green run. Issue60 open.
- **NO-GO** for release: actual legitimate Clerk-authenticated EN81-20 `/api/ask` cited answer, exact source edition/fingerprint/page verification, disposable full-state D1 restore + dual Vectorize reconciliation, real concurrency/cost/fencing and rollback, final-stack conflict/review and exact-final-head CI remain mandatory. No parallel indexing or Gamma.


### 2026-10-24 — stacked-PR reconciliation and publication visibility safety

- Read-only GitHub SHA review: PR64 `54600ec`, PR65 `97bbe3a`, PR66 `4225292`, PR67 `9149573`, PR68 `a3bb1b6`, PR69 `3a885c4`; PR63 baseline `3bec95c`. `git cherry` alone shows many unique commits because extraction/cherry-pick histories differ; never infer missing features or blindly merge from commit counts.
- Direct code comparison: PR67's `request-auth.ts` and `test-request-auth.ts` have **no content difference** against PR63, so do not double-merge PR67. PR66's core lease/generation modules already match PR63, while PR63 has later full-publication/visibility hardening; do not blindly merge PR64–66. PR69 contains distinct QA workflow/bootstrap changes plus older code differences, requiring selective reconciliation, not wholesale merge.
- PR68's remaining **5-line visibility hardening** was absent from PR63: malformed `gN:` staged IDs could otherwise fall back as legacy when D1 absent. Ported the exact malformed-stage fail-closed guard and 11-line regression into the local integration worktree, without weakening configured-D1 or legacy-only checks. Focused visibility test and TypeScript PASS. Final local OpenNext 1.20.12 bundle PASS after the port.
- This is a **local integration candidate only**. No remote PR head, GitHub CI, Cloudflare QA or Production was changed by this addendum. Issue60 remains open; release NO-GO until remaining gates.

### 2026-10-24 — bounded PR61/Issue60 customer source-page gate

- **Milestone:** customer standards evidence gate, IN PROGRESS; **last verified item:** local source-page rejection fix and 64-case regression PASS; **active blocker:** primary-source edition/page truth and legitimate signed-in customer answer remain UNVERIFIED. Next measurable action, in a separately authorized environment: inspect the exact source and execute Clerk-authenticated `/api/ask` QA after restoring dependencies. No release ETA or deadline change; no owner decision needed for this completed bounded local slice.
- Exact initial/final committed HEAD `eb54b3ee5ae077a23675c551f695189f51f1aead`, detached clean PR63 baseline. Work only in `elevator-help-PR61-ARCHIVE-QA-20261024`; changes uncommitted. No other checkout, remote/GitHub, production, secrets, paid API or user archive access; no install, indexing, flag change, commit, push, merge or deployment.
- **Proven flaw at the shared source-bound verifier:** missing/invalid source pages could still qualify as `standards_verified`; metadata coercion also turned `true` into page 1. Before fix: actual production-engine regression FAIL, 28 invalid-page cases accepted out of 32 synthetic semantic cases. After fix: both exact/semantic evidence adapters parse pages conservatively and verifier requires a positive safe integer source page; **64/64 synthetic cases PASS**, including valid source pages and rejection of model-invented page 999. No EN81-20 edition, fingerprint, page, clause or normative requirement was fabricated. Existing clause/publication/auth/Gemini behavior is preserved except the demonstrated unsafe verified-page acceptance. Incomplete legacy evidence may now use the existing web fallback more often.
- **Trace/provenance limits:** Drive MD5 or modifiedTime:size revision -> physical PDF page chunks -> D1 exact evidence / RAW Vectorize metadata -> active publication filter -> evidence adapters -> Gemini claims -> verifier/formatter -> customer route. A revision marker and a plausible positive page do not authenticate edition or source truth. Answer verification carries but does not independently validate fingerprint; identifiers include excerpt cross-references, matching uses normalized suffixes, and no printed-page/title-page/edition proof was obtained. Existing generation tests cover stale publication exclusion, not complete archive deduplication/deletion/cache invalidation or genuine EN81-20 citation correctness.
- **Auth:** production code unchanged; real Clerk token path, request-origin authorizedParties, required SDK subject and auth-before-body ordering inspected. New offline actual-function regression PASS for SDK-verified subject/token/origin and missing/invalid-session negatives, with Clerk SDK explicitly mocked. It is not a real Clerk session or signature verification. No auth bypass was added. Local CI definitions include the new page/auth regressions; no Actions were triggered.
- **Local Windows Node24 PASS:** source-page, clause-boundary, Cortex standards/budget, generic clause parser, document identity, publication visibility, published exact generation, full publication and local SQLite restore; static security, Next security-floor and QA-edge guards; signed-in QA harness syntax; diff whitespace. **FAIL/blocked:** installed-SDK auth (missing Clerk), topic/retry/legacy suites (missing TypeScript), `tsc` (missing compiler), Next and OpenNext builds (missing executables). No network audit attempted. Dependencies unchanged; earlier historical PASS claims do not apply to this worktree. Local commands took about 1–5 seconds including shell startup; zero paid calls, no production cost/latency measured.
- **NO-GO for release/closure:** restore dependencies and pass blocked checks/current audit and exact-final-change Node22 CI; independently verify primary-source EN81-20 edition/content identity/page/clause and genuine Clerk-authenticated customer answer; complete full-state isolated D1 + both Vectorize layers recovery/invalidation, heterogeneous conflicting/unknown-source QA, live concurrency/cost/rollback, stack review and owner release authorization. Evidence, exact commands and PASS/FAIL: [PR61-ARCHIVE-QA-2026-10-24.md](./PR61-ARCHIVE-QA-2026-10-24.md). Stop after this bounded task; no whole-archive completion or deployment success claimed.

### 2026-10-25 — PR70 source-page guard isolated verification (post-report update)

The earlier missing-dependency and Windows junction-only Cloudflare bundle failures were local environment issues, not a passing release gate. After an isolated `npm ci --prefer-offline --no-audit --no-fund` in this checkout, focused 64/64 source-page cases, mocked Clerk contract, topic retrieval, `npm run test:request-auth`, TypeScript, static security baseline, Next build and `npm run cf:build` all exited 0 locally. No real Clerk session, authenticated production answer, EN81-20 active-generation edition/page verification, remote D1/Vectorize rollback or exact-head Ubuntu CI was demonstrated. PR70 is Draft stacked on PR63; no merge/deploy/Issue60 closure authorized. Evidence logs remain untracked in the local QA checkout. Source edition existence was separately inspected in the owner-authorized Drive archive (DIN EN 81-20:2014-11), but no private source content or Drive identifier is committed.

### 2026-10-25 â€” Owner-authorized primary-source read (bounded, no archive identifiers committed)

Direct read of the owner's Google Drive PDF titled `DIN EN 81-20, 11-2014-DE.pdf` confirmed the document title page states German version EN 81-20:2014 / DIN EN 81-20:2014-11. The source text has section 5.4.7 (car roof), section 5.4.7.3, and section 5.4.7.4. In this PDF's printed pagination, 5.4.7.4 begins on printed page 73 and continues onto printed page 74; the page boundary was observed directly in the extracted source. No normative text, private Drive ID, account data, or copyrighted extract is committed. This is source-existence, edition-label, clause-location and **printed-page** evidence only; PDF physical page ordinal, checksum/fingerprint, edition currency/applicability, ingestion generation, D1/Vectorize mapping, and authenticated customer answer remain unverified. This source read does not authorize verified production citations, merging, deployment or Issue60 closure. PR70 remains Draft / NO-GO pending exact-head CI and remaining release gates.
