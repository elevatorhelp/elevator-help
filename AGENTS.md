# Agent instructions for elevator.help

**Read [SUPER_GPT_VISION.md](./SUPER_GPT_VISION.md) before planning or implementing any change.** It is the project's durable mission and architectural decision framework.

## Mandatory work protocol
1. State the system-level problem and the general layer responsible, not merely the failing example.
2. Inspect the current architecture/tests and preserve the Gemini reasoning role.
3. Prefer folder-, manufacturer-, controller-, standard-, and language-independent solutions. Never add prompt-specific, file-specific, or vendor-specific branches to make a narrow test pass.
4. Keep source evidence verifiable: exact document/version/page/clause for standards and safety claims. Summaries, embeddings, and Book-to-Skill outputs are secondary aids, never primary evidence.
5. Handle dynamic archive ingestion, deduplication, updates, stale cache/index invalidation, and uncertainty explicitly.
6. Verify broadly across heterogeneous documents and previously failing cases. Include unknown/unseen cases; do not call a one-folder demo 'complete'.
7. Report test coverage, failed tests, security impacts, real cost/latency observations, and remaining limitations. Never assert deployment success or complete archive ingestion without confirmation.
8. Use existing project tooling where effective; avoid unnecessary architectural rewrites or introducing services merely because they are fashionable.
9. Perform authorized GitHub/production changes deliberately, maintaining CI and existing behavior.

If a local implementation decision clashes with the vision, document the tradeoff and seek a general solution first.
