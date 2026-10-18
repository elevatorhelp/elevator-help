# Offline D1 regular-table backup verification

Run with Node 22 or later from the isolated worktree:

`node scripts/test-regular-table-backup.mjs <pre-FTS-source.sql>`

`node scripts/export-regular-tables.mjs <pre-FTS-source.sql> <new-output.sql>`

The exporter creates a new SQL file and JSON manifest. It refuses to overwrite existing outputs. The command independently restores the output to SQLite, checks integrity, and compares every regular table fingerprint.

The test restores the source snapshot, creates an FTS5 virtual table, then backs up ordinary tables without FTS virtual or shadow tables. It verifies original archive rows, foreign keys, binary and Unicode values, composite keys, generated columns, and AUTOINCREMENT sequences. It also recreates FTS5 after restoring ordinary tables.

The backup includes regular tables, indexes and triggers. Views and virtual tables are excluded. Restore virtual indexes using reviewed migrations and repopulate them before application traffic resumes.

**Safety boundary:** This is an offline backup and restore validator, not a live Cloudflare extraction. A consistent remote extraction or snapshot, verified in a separate database, is required before any production migration. Keep the existing pre-FTS SQL snapshot intact. No production writes are part of this procedure.
