# elevator.help — Architecture, Tooling & Reuse Handoff

Snapshot: 2026-10-18. This is a **verified code/config inventory plus explicitly marked roadmap**, not a declaration that the archive is fully indexed. Keep this alongside `SUPER_GPT_VISION.md`, `ROADMAP.md`, and `ARCHIVE_INDEX_ROLLOUT.md` for future projects.

## Mission and invariants

A domain-capable, multilingual, evidence-grounded elevator assistant (not a PDF chatbot). **Gemini is the reasoning brain**, while deterministic parsers, retrieval, Cloudflare storage, and tools supply verifiable facts. The architecture must be reusable for another industry by replacing a domain pack rather than hardcoding folders, manufacturers, standards, or test prompts. Standards/safety claims require primary-source document/version/page/clause evidence. Never present generated summaries or Book-to-Skill outputs as normative evidence.

## Deployed application stack (repository configuration)

| Layer | Current implementation | Evidence in repository |
|---|---|---|
| UI/API | Next.js 16.3.8, React 19.2.8, TypeScript 5.9; App Router | `package.json`, `app/api/ask/route.ts` |
| Hosting | Cloudflare Workers via OpenNext 1.20.10 and Wrangler 4.125.0 | `open-next.config.ts`, `wrangler.jsonc` |
| Authentication | Clerk backend and Next.js integrations; auth required | `package.json`, `wrangler.jsonc`, `app/lib/request-auth.ts` |
| Reasoning | Gemini API as model brain; configured call budgets | `app/lib/gemini-cost-control.ts`, `wrangler.jsonc` |
| Durable structured evidence | Cloudflare D1 `elevator-help-cortex` | `wrangler.jsonc`, `app/lib/archive-evidence-index.ts` |
| Semantic retrieval | Cloudflare Vectorize `elevator-help-index` and `elevator-help-multilingual-v2` | `wrangler.jsonc`, `app/lib/multilingual-embedding.ts` |
| Cloudflare AI | Workers AI binding `AI` also exists; **not the designated reasoning brain** | `wrangler.jsonc` |
| Ingestion | GitHub Actions + Google Drive service-account access; `unpdf` for PDF text, LibreOffice conversion for Office documents | `.github/workflows/drive-ingestion.yml`, `scripts/drive-ingest.mjs` |
| Quality | Automated language, security, auth, cost, retrieval, standards, domain, and ingestion regression scripts | `package.json`, `scripts/test-*` |

Configuration currently enables multilingual retrieval, learning and a 10-question daily limit; `GEMINI_MAX_CALLS_PER_QUESTION=5`, `GEMINI_MAX_CALLS_PER_INGEST_REQUEST=3`. Do not assume these are actual observed costs. Keep credentials in environment secrets; never commit archive PDFs, API keys, or private document contents.

## Request and evidence flow

1. Clerk-authenticated request enters `/api/ask`; request authentication, rate/cost and quota policies apply.
2. Query interpretation/routing selects exact archive evidence, standards/cortex retrieval, semantic retrieval, or general knowledge as appropriate; relevant modules: `app/lib/router.ts`, `query-policy.ts`, `internal-retrieval.ts`, `retrieval-backend.ts`, `reference-identifiers.ts`, `standard-identifiers.ts`, `domain-pack.ts`.
3. Grounded evidence is checked against source identity, version, page and clause; `cortex-evidence-policy.ts`, `cortex-standards-engine.ts`, `archive-evidence-index.ts` are the principal policy/evidence components.
4. Gemini reasons over selected context when needed. Answer formatting/localization and source labeling must not fabricate citations or disclose private index implementation.
5. Optional learning/cache must remain version-aware and non-authoritative: never promote model answers to standards. See `cortex-learning.ts` and `SUPER_GPT_VISION.md`.

This is the intended logical architecture; individual routing branches require end-to-end verification before being described as universally covered.

## Archive indexing: current behavior

`drive-ingestion.yml` is scheduled at 03:17, 09:17, 15:17 and 21:17 UTC, also triggered by relevant pushes and manual dispatch. Its default maximum is **20 documents per run**, with a **30 reserved Gemini-call budget per process**. It restores and saves `.ingestion-state` via GitHub Actions cache. Ingestion traverses supported Drive files, identifies document language/standard and source path, and fingerprints changed content. Rename/move and deletion require care: deletion uses two scans. It advances three distinct phases: **exact evidence chunks first**, **raw semantic vectors second**, **document maps third**. `unpdf` extracts PDF text; LibreOffice converts Office formats; chunking is page-aware with overlap. The recent extraction quality gate logs `EXTRACTION_PARTIAL` / `EXTRACTION_REVIEW_REQUIRED` for low-text pages without spending Gemini calls; **OCR itself is not yet installed in this pipeline**.

**Last verified run**: GitHub Actions run `39164032557` on 2026-10-18, success; 241 supported Drive documents discovered; 20 documents processed in that run; **152 documents still needed exact-evidence indexing**; Gemini calls reserved 0/30. Thus ~89/241 had completed exact-evidence processing at that checkpoint. This does **not** establish completion of semantic vectors or document maps, nor full citation QA. Evidence count may change with archive uploads; consult fresh run logs.

GitHub stores **source code, CI and orchestration**; Cloudflare D1/Vectorize store the **production indexes**. Never publish proprietary archive PDFs or extracted private content to the GitHub repository.

## Tools available versus tools still planned

**Already present:** `unpdf`, LibreOffice conversion, deterministic document identity/language resolver (`scripts/document-identity.mjs`), SHA-256-based stable vector IDs, Drive checksum/metadata fingerprinting, resumable per-phase ingestion state, D1 exact-evidence indexing, multilingual Vectorize, Gemini budget guards, CI regression suites, GitHub Actions scheduling, Clerk, Cloudflare observability.

**Not yet verified/implemented as a general production capability:** layout-aware table extraction (e.g., pdfplumber/Camelot), selective OCR for scanned pages, content-addressed **cross-document embedding reuse** (distinct from stable vector IDs and per-file change detection), generalized spreadsheet **execution/calculation** from archive or user upload, image-to-parts/supplier workflow, complete Book-to-Skill derivation, automatic proof of end-to-end citations for every document family. Do not claim these are already live merely because they appear in a roadmap.

## Reusable architecture for the next site

Build a shared ingestion/retrieval core with pluggable **domain packs** (identifiers, terminology, evidence policy, document categories, output language and domain tools). Separate ingestion into (A) deterministic parse/normalize/page/table/identity with zero Gemini tokens, (B) exact lexical/clause evidence, (C) semantic embeddings only where justified, (D) optional document maps/skills, and (E) source-grounded retrieval + Gemini reasoning. Cache by **content hash + parser/version + embedding model/version + policy version**, with invalidation on edits, source version changes, or permissions. Never share private indexes across tenants. Make OCR selective, not blanket; preserve tables/formulas and citation anchors. Reuse the same engine for Initial Full Index and later incremental Live Archive.

## Next optimization order and release gates

1. Finish and verify all three indexing phases for the **whole archive**, including standards, manuals, error catalogs, supplier catalogs, multilingual variants and unknown folders. Report totals **per phase**, not just green CI.
2. Add extraction quality metrics per page and selective OCR, then layout-aware tables/formulas with source-page anchors; test across unrelated document families.
3. Add content-addressed parsed-text and embedding caches; compare actual Gemini calls, tokens, storage, latency and correctness before/after.
4. Add source/version-aware retrieval and citation regression suites; include cross-document conflict, renamed/deleted files, scanned pages, duplicate documents and permissions.
5. Integrate safe spreadsheet calculations and optional Book-to-Skill **only after** source-verification boundaries are maintained.
6. Release via isolated branch, CI, reviewed PR, controlled deployment, production smoke test and rollback path. Preserve backups and unrelated dirty worktrees.

**Critical distinction:** successful GitHub Actions workflow != full archive indexing != verified end-user citation. Check all three separately. For any new industry site, start from this document plus `SUPER_GPT_VISION.md` and avoid one-off per-folder fixes.
