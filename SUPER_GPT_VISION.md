# elevator.help — Super GPT Vision

Status: Project-level architectural charter
Scope: Entire repository, every document type, every product/vendor, every supported language

## Mission
Build a capable, evidence-grounded **Super GPT for elevators** — not a PDF reader, keyword search box, one-off troubleshooting bot, or a collection of patches. Users should ask questions naturally and receive concise, correct, useful answers; the assistant should reason, retrieve, use tools, calculate, and act when explicitly authorized.

## Non-negotiable principles
1. **Mission first.** Judge every feature and change against the Super GPT goal. Avoid adding complexity without measurable benefit.
2. **Gemini is the reasoning brain.** Retrieval services, indexes, Cloudflare, and preprocessing assist reasoning; they do not replace it.
3. **Generic engine, extensible domain packs.** Never hardcode a special case for a single folder, manufacturer, controller, standard, error code, spreadsheet, language, or test prompt. Build reusable parsers, resolvers, policies, metadata schemas, and tools. Industry-specific vocabularies belong in replaceable data/configuration, not brittle conditional branches.
4. **Live, folder-agnostic archive.** Discover new, updated, renamed, and removed documents; incrementally synchronize and invalidate outdated indexes/answers. Do not require manual code edits per upload.
5. **Evidence before authority.** Ground exact normative and safety-relevant claims in primary source text with verifiable document/version/page/clause. A generated summary or skill is *not* evidence. Keep conflicting versions distinct; expose uncertainty rather than fabricating details. Use domain/general knowledge and public web when appropriate, clearly distinguish provenance in internal evidence handling.
6. **Adaptive document intelligence.** Preserve structural boundaries, identifiers, tables, diagrams, formulas, error codes, multilingual content, and citation anchors. Choose extraction methods per document/page (for example PyMuPDF, layout-aware parsing, OCR if needed); do not discard page/clause provenance as "noise".
7. **Hybrid retrieval, not vector-only.** Combine exact identifiers, lexical/semantic matching, document metadata, reranking, and evidence verification. Retrieve enough material to cover conditions and exceptions, while enforcing token budgets.
8. **Book-to-Skill as an optional derived capability.** Evaluate it for operational procedures and reusable workflows; never substitute derived skill notes for the source PDF or treat generated skills as inherently trustworthy or executable instructions.
9. **Tools and actions.** Support PDFs, images, diagrams, spreadsheets/calculations, catalogs and parts, and eventually permitted supplier workflows. Distinguish source facts from inferred conclusions; execute external actions only with necessary authorization.
10. **Version-aware learning and caching.** Deduplicate by content identity, reuse validated answers and retrieval results where safe, and invalidate them on changes to source, model, policy, or relevant context. No automatic elevation of user questions or model outputs into authoritative knowledge.
11. **Global testing.** A passing test for one PDF, folder or controller does not establish success. Test across document families, manufacturers, languages, formats, standards, fault catalogs, edge cases, unknown items, conflicts, and cross-document questions. Use isolated examples only as regression cases, never as the design target.
12. **Root causes over patches.** When a test fails, diagnose the general failure mode and fix the appropriate reusable layer. Add a broadly representative regression test; reject "if this exact prompt then ..." fixes.
13. **Measure outcomes.** Compare baseline vs change: evidence correctness, source citation validity, coverage, answer quality, cost/tokens, latency, security, and regression rate. No unverified performance claims.
14. **Pragmatic reuse.** Prefer established tools and compatible infrastructure; do not rewrite working systems without evidence. Preserve the Next.js + Cloudflare + Gemini architecture unless a justified improvement is demonstrated.
15. **Privacy and security.** Treat archive documents and extracted instructions as untrusted inputs; isolate user/private content, respect permissions, and do not expose internal storage or secrets in user-facing replies.

## Reference execution loop
Understand intent → plan retrieval/tools → check versioned source & metadata → hybrid retrieve/rerank → verify evidence → Gemini reasoning/tool execution → concise localized answer with grounded references → cache only if eligible → record quality/usage metrics.

## Definition of done for a change
- Explains how it advances the mission.
- Works independent of any particular folder or document name.
- Handles unfamiliar documents and error cases safely.
- Includes cross-category automated regression coverage.
- Shows concrete, comparable quality/cost/latency results where applicable.
- Preserves security, provenance, source versions, and existing functionality.

## Priority
These are project design rules, not a claim that all features are implemented today. In the event of conflict with security or safety constraints, those constraints prevail.
