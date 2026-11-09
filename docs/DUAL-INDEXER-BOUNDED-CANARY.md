# Dual archive indexer — bounded first Production canary

This is a strictly opt-in **manual** extension of the existing scheduled
`Drive ingestion` GitHub Actions workflow. The existing four scheduled
serial runs remain the default. No second automatic schedule is enabled.

## Preflight
- Check `elevator.help/admin` and record D1 evidence and latest Drive
  Evidence/RAW/Map snapshot. Snapshot is a start-of-run count, not a
  current number of unique PDFs.
- Verify main commit, last successful serial ingestion cache,
  existence of `.ingestion-state/drive.json`, its configured Drive scope
  and at least 100 known document checkpoints.
- The two workers run under existing GitHub Actions
  `elevator-help-drive-ingestion` concurrency lock. This prevents
  overlap with existing GitHub serial schedule, **not** with all
  authenticated external HTTP writers. Do not start unrelated ingestion.
- Scope is existing approved Drive root. No Force Reingest.
- True Production-safe D1 fencing, durable backup/restore and actual
  customer PDF citation validation remain separate release gates.

## One bounded manual canary
1. On main branch, open GitHub Actions -> **Drive ingestion** -> Run workflow.
2. Leave the approved default folder ID; set `dual_canary=true`.
3. Set `dual_canary_confirmation` to
   `APPROVE_2_DOCUMENTS_SHARED_60_CALLS`.
4. Workflow must restore prior serial checkpoint. Missing, empty, wrong-scope
   or implausibly small checkpoint hard-fails before paid calls.
5. Two OS processes run concurrently, each on a deterministic disjoint
   SHA-256 Drive file-ID shard. Each attempts <= 1 eligible file; each
   reserves <= 30 Gemini calls, combined <= 60 (existing per-run cap).
6. Separate atomic shard checkpoint files are validated for no overlap,
   merged into the serial fallback checkpoint file and saved via the
   preexisting Actions cache/save step. A failed child still causes
   workflow failure, after attempt at checkpoint reconciliation.
7. Verify both shard process summaries, no race, successful checkpoint
   save, and subsequent serial-run resume. Compare archive metrics.
   A green synthetic QA test is **not** a successful Production run.

## Recovery
- If canary fails, keep scheduled serial worker available; do not blindly
  replay costly operations. Investigate sanitized error and checkpoint.
- Original serial checkpoint is not overwritten until both child processes
  exit and merge validation succeeds. Earlier Actions caches still exist.
- To return to normal, choose `dual_canary=false` or allow the scheduled
  serial job; its checkpoint is the usual `.ingestion-state/drive.json`.
- Crash before the merge may leave remote writes that are not reflected in
  the serial checkpoint. Reconcile D1/Vectorize publication receipts first.
- Actions cache is evictable; this is NOT a transactional durable checkpoint.
- A separate universal D1 fencing / generation-qualified Vectorize
  publication architecture remains necessary before continuously running
  two independent Production writer jobs.

## Privacy
Never log secrets, bearer tokens, confidential document names, unredacted
Drive contents or raw API failures. Output only counts and sanitized codes.
