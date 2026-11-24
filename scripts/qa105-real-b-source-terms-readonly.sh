#!/usr/bin/env bash
# Issue #105 real isolated QA D1 origin source terms preflight.
# No PDF/source text, paths, row IDs, credentials or full query result logs.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true &&
   "${GITHUB_EVENT_NAME:-}" == push &&
   "${GITHUB_REF:-}" == refs/heads/feat/issue106-shadow-map-revision-20261122 &&
   "${QA105_SOURCE_PREFLIGHT:-}" == QA105_STRICT_B_SOURCE_READONLY &&
   -z "${GEMINI_API_KEY:-}" && -z "${CLERK_SECRET_KEY:-}" ]] || {
  echo "::error::QA105_SOURCE_CONTEXT_DENIED"; exit 1;
}
for key in CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN RUNNER_TEMP;do
 [[ -n "$(printenv "$key")" ]] || { echo "::error::QA105_SOURCE_ENV_DENIED"; exit 1; }
done
node --input-type=module <<'NODE'
import {readFileSync} from "node:fs";
const c=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
if(c.d1_databases?.length!==1||
 c.d1_databases[0].database_id!=="02716877-15e3-4478-9e24-f1ba6e5dfb00"||
 c.d1_databases[0].database_name!=="elevator-help-lease-test-01"||
 c.vectorize?.length!==2 ||
 c.vectorize[0].index_name!=="elevator-help-staging-test"||
 c.vectorize[1].index_name!=="elevator-help-staging-test-v2"||
 c.vars?.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only")
 throw Error("QA105_UNAPPROVED_CLOUDFLARE_BINDINGS");
NODE
TMP="$(mktemp -d "$RUNNER_TEMP/qa105-b-terms.XXXXXXXX")"
trap 'rm -rf "$TMP"' EXIT
B="1iybMaW8SaB3QfBLfdFJO5ymefVDdjmFn"
A="1cT2iBMx7pFDr_JKfZFBSG9xVFu3WZu3v"
SQL="SELECT
 (SELECT COUNT(*) FROM ingestion_v2_map_revision_activations WHERE document_id='$B' AND state='active') AS active_revision,
 (SELECT COUNT(*) FROM ingestion_v2_map_revision_candidates WHERE document_id='$B' AND state='embedded') AS embedded_candidate,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$B' AND page=1 AND INSTR(UPPER(text),'QA-4711')>0 AND INSTR(UPPER(text),'QA-1.2.3')>0) AS de_source_text,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$B' AND page=2 AND INSTR(UPPER(text),'MOCK-DOOR-12')>0 AND INSTR(UPPER(text),'QA-2.4.6')>0) AS it_source_text,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$B' AND kind='reference' AND term_key='QA-4711') AS de_ref,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$B' AND kind='clause' AND term_key='QA-1.2.3') AS de_clause,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$B' AND kind='reference' AND term_key='MOCK-DOOR-12') AS it_ref,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$B' AND kind='clause' AND term_key='QA-2.4.6') AS it_clause,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$B') AS b_evidence_rows,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$A' AND page=1 AND INSTR(UPPER(text),'QA-4711')>0 AND INSTR(UPPER(text),'QA-1.2.3')>0) AS a_de_source,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$A' AND page=2 AND INSTR(UPPER(text),'MOCK-DOOR-12')>0 AND INSTR(UPPER(text),'QA-2.4.6')>0) AS a_it_source,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$A' AND kind='reference' AND term_key='QA-4711') AS a_de_ref,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$A' AND kind='clause' AND term_key='QA-1.2.3') AS a_de_clause,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$A' AND kind='reference' AND term_key='MOCK-DOOR-12') AS a_it_ref,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id='$A' AND kind='clause' AND term_key='QA-2.4.6') AS a_it_clause,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id='$A') AS a_evidence_rows,
 (SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id='$A') AS a_legacy_published,
 (SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id='$B') AS b_legacy_published;"
npx wrangler d1 execute elevator-help-lease-test-01 --remote --config wrangler.qa-pr100-v2.json --json --command "$SQL" > "$TMP/rows.json" 2>"$TMP/wrangler.err"
node --input-type=module - "$TMP/rows.json" <<'NODE'
import {readFileSync} from "node:fs";
const obj=JSON.parse(readFileSync(process.argv[2],"utf8"));
const batch=Array.isArray(obj)?obj:[obj];
const records=batch.flatMap(x=>x.results||[]);
if(records.length!==1)throw Error("QA105_SOURCE_BAD_ROW_COUNT");
const r=records[0];
const keys=["active_revision","embedded_candidate","de_source_text","it_source_text","de_ref","de_clause","it_ref","it_clause","b_evidence_rows","a_de_source","a_it_source","a_de_ref","a_de_clause","a_it_ref","a_it_clause","a_evidence_rows","a_legacy_published","b_legacy_published"];
if(Object.keys(r).length!==keys.length||
 keys.some(k=>!Number.isSafeInteger(Number(r[k]))||Number(r[k])<0||Number(r[k])>4096))
 throw Error("QA105_SOURCE_BAD_COUNTS");
for(const key of keys)console.log("QA105_SOURCE_"+key.toUpperCase()+"="+r[key]);
console.log("PASS:QA105_REAL_QA_B_SOURCE_TERMS_INSPECTED_READONLY");
NODE
