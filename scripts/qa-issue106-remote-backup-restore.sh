#!/usr/bin/env bash
# One-shot Issue106 Cloudflare D1 QA backup/restore on a NEW scratch D1 only.
set -Eeuo pipefail
umask 077
SOURCE=elevator-help-lease-test-01
SOURCE_ID=02716877-15e3-4478-9e24-f1ba6e5dfb00
CONFIG=wrangler.qa-pr100-v2.json
BRANCH=refs/heads/feat/issue106-shadow-map-revision-20261122
if [[ "${GITHUB_ACTIONS:-}" != true || "${GITHUB_EVENT_NAME:-}" != push ||
      "${GITHUB_REF:-}" != "$BRANCH" ||
      "${QA106_REMOTE_APPROVAL:-}" != QA106_REMOTE_QA_EXPORT_RESTORE_ONLY_20261122 ||
      ! "${GITHUB_RUN_ID:-}" =~ ^[1-9][0-9]{5,19}$ ]]; then
  echo "::error::QA106_REMOTE_REHEARSAL_CONTEXT_DENIED"; exit 1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ||
      -n "${GEMINI_API_KEY:-}" || -n "${GEMINI_BENCHMARK_API_KEY:-}" ]]; then
  echo "::error::QA106_CREDENTIAL_BOUNDARY_DENIED"; exit 1
fi
node --input-type=module -e '
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync(process.argv[1],"utf8"));
if(c.d1_databases?.length!==1||
 c.d1_databases[0].database_name!==process.argv[2]||
 c.d1_databases[0].database_id!==process.argv[3]||
 c.d1_databases[0].binding!=="CORTEX_DB"||
 c.vectorize?.length!==2||
 c.vectorize[0].index_name!=="elevator-help-staging-test"||
 c.vectorize[1].index_name!=="elevator-help-staging-test-v2")process.exit(1);
' "$CONFIG" "$SOURCE" "$SOURCE_ID" || {
  echo "::error::QA106_NOT_EXCLUSIVE_QA_BINDING"; exit 1
}
SCRATCH=qa106-restore-$GITHUB_RUN_ID
[[ "$SCRATCH" =~ ^qa106-restore-[1-9][0-9]{5,19}$ ]] || exit 1
PRIVATE="$(mktemp -d "${RUNNER_TEMP:?}/qa106-restore-private.XXXXXXXX")"
CREATED=0
cleanup() {
  local rc="$?"
  trap - EXIT
  set +e
  if [[ "$CREATED" == 1 ]]; then
    if npx wrangler d1 delete "$SCRATCH" --skip-confirmation >"$PRIVATE/delete.log" 2>&1; then
      echo PASS:QA106_SCRATCH_D1_DELETED
    else
      echo "::error::QA106_SCRATCH_CLEANUP_REQUIRED:$SCRATCH"; rc=1
    fi
  fi
  rm -rf "$PRIVATE"
  exit "$rc"
}
trap cleanup EXIT
if ! npx wrangler d1 list --json >"$PRIVATE/list.json" 2>"$PRIVATE/list.err"; then
  echo "::error::QA106_CANNOT_IDENTIFY_D1"; exit 1
fi
node --input-type=module - "$PRIVATE/list.json" "$SOURCE" "$SOURCE_ID" "$SCRATCH" <<'NODE' || {
import {readFileSync} from "node:fs";
const all=JSON.parse(readFileSync(process.argv[2],"utf8"));
if(!Array.isArray(all))process.exit(1);
const x=all.filter(v=>v.name===process.argv[3]);
if(x.length!==1||(x[0].uuid!==process.argv[4]&&x[0].id!==process.argv[4])||
 all.some(v=>v.name===process.argv[5]))process.exit(1);
NODE
  echo "::error::QA106_SOURCE_ID_MISMATCH_OR_SCRATCH_EXISTS"; exit 1
}
echo PASS:QA106_FIXED_QA_D1_IDENTITY
PDF_A=1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v
PDF_B=1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn
ROOT=1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC
SQL="SELECT
 (SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id='$PDF_A') AS a_pub,
 (SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id='$PDF_B') AS b_pub,
 (SELECT COUNT(*) FROM ingestion_v2_vector_receipts WHERE document_id='$PDF_B' AND layer='map') AS b_map,
 (SELECT COUNT(*) FROM ingestion_v2_vector_receipts WHERE document_id='$PDF_B' AND layer='raw') AS b_raw,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$PDF_B') AS b_evidence,
 (SELECT COUNT(*) FROM ingestion_global_leases WHERE
  job_key IN ('drive:${ROOT}_qa_A','drive:${ROOT}_qa_B') AND
  lease_until_ms>CAST(strftime('%s','now') AS INTEGER)*1000) AS active_leases;"
snap() {
  if ! npx wrangler d1 execute "$1" --remote --json --command "$SQL" \
      >"$2" 2>"$PRIVATE/query.err"; then
    echo "::error::QA106_D1_QUERY_UNAVAILABLE"; return 1
  fi
}
snap "$SOURCE" "$PRIVATE/before.json"
node --input-type=module - "$PRIVATE/before.json" <<'NODE' || {
import {readFileSync} from "node:fs";
const d=JSON.parse(readFileSync(process.argv[2],"utf8"));
const a=Array.isArray(d)?d:[d],x=a.flatMap(v=>v.results||[])[0];
if(!x||Number(x.a_pub)!==1||Number(x.b_pub)!==0||
 Number(x.b_map)!==1||Number(x.b_raw)!==2||
 Number(x.b_evidence)!==2||Number(x.active_leases)!==0)process.exit(1);
NODE
  echo "::error::QA106_PREEXPORT_A_B_STATE_MISMATCH"; exit 1
}
echo PASS:QA106_A_PUBLISHED_B_INCOMPLETE_NO_ACTIVE_LEASE
BACKUP="$PRIVATE/backup.sql"
if ! npx wrangler d1 export "$SOURCE" --remote --config "$CONFIG" \
    --skip-confirmation --output "$BACKUP" >"$PRIVATE/export.log" 2>&1; then
  echo "::error::QA106_REMOTE_EXPORT_FAILED"; exit 1
fi
[[ -s "$BACKUP" ]] && (( $(wc -c <"$BACKUP") <= 20971520 )) || {
  echo "::error::QA106_BACKUP_NOT_BOUNDED"; exit 1
}
# Locally restore first to establish backup is usable. No SQL/data logs.
if ! python3 - "$BACKUP" "$PRIVATE/restore.sqlite" >"$PRIVATE/local.log" 2>&1 <<'PY'; then
import sqlite3,sys
db=sqlite3.connect(sys.argv[2])
with open(sys.argv[1],encoding="utf-8") as f: db.executescript(f.read())
tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
assert {"ingestion_v2_publications","ingestion_v2_vector_receipts",
        "ingestion_v2_staged_evidence"}.issubset(tables)
assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
db.close()
PY
  echo "::error::QA106_LOCAL_RESTORE_FAILED"; exit 1
fi
echo PASS:QA106_REAL_EXPORT_AND_LOCAL_RESTORE
# Only the newly allocated DB may be mutated. Never restore to SOURCE.
if ! npx wrangler d1 create "$SCRATCH" --jurisdiction eu >"$PRIVATE/create.log" 2>&1; then
  echo "::error::QA106_SCRATCH_CREATE_NOT_PERMITTED"; exit 1
fi
CREATED=1
if ! npx wrangler d1 execute "$SCRATCH" --remote --yes --file "$BACKUP" \
    >"$PRIVATE/import.log" 2>&1; then
  echo "::error::QA106_REMOTE_SCRATCH_RESTORE_FAILED"; exit 1
fi
snap "$SCRATCH" "$PRIVATE/restored.json"
compare() {
  node --input-type=module - "$1" "$2" <<'NODE'
import {readFileSync} from "node:fs";
const read=p=>{const d=JSON.parse(readFileSync(p,"utf8"));
const a=Array.isArray(d)?d:[d];return a.flatMap(v=>v.results||[])[0]};
const a=read(process.argv[2]),b=read(process.argv[3]);
if(!a||!b)process.exit(1);
for(const k of ["a_pub","b_pub","b_map","b_raw","b_evidence"])
 if(Number(a[k])!==Number(b[k]))process.exit(1);
NODE
}
compare "$PRIVATE/before.json" "$PRIVATE/restored.json" || {
  echo "::error::QA106_REMOTE_RESTORE_COUNTS_MISMATCH"; exit 1
}
echo PASS:QA106_REAL_REMOTE_D1_RESTORE
for sqlfile in docs/qa106-map-revision-shadow-schema.sql docs/qa106-generic-map-revision-preview-schema.sql; do
  for pass in 1 2; do
    if ! npx wrangler d1 execute "$SCRATCH" --remote --yes --file "$sqlfile" \
        >"$PRIVATE/migrate.log" 2>&1; then
      echo "::error::QA106_MIGRATION_NOT_IDEMPOTENT"; exit 1
    fi
  done
done
snap "$SCRATCH" "$PRIVATE/migrated.json"
compare "$PRIVATE/restored.json" "$PRIVATE/migrated.json" || {
  echo "::error::QA106_MIGRATION_CHANGED_LEGACY_ROWS"; exit 1
}
snap "$SOURCE" "$PRIVATE/after.json"
compare "$PRIVATE/before.json" "$PRIVATE/after.json" || {
  echo "::error::QA106_SOURCE_QA_COUNTS_CHANGED"; exit 1
}
echo PASS:QA106_REMOTE_RESTORE_ADDITIVE_MIGRATION_TWICE
echo PASS:QA106_SOURCE_QA_UNCHANGED_NO_GEMINI_NO_PRODUCTION
