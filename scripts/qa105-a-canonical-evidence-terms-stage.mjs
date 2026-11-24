/**
 * One-time, strictly READ-ONLY canonical term check for the previously published
 * original two-page A test PDF. No model calls, NO D1 writes or source changes.
 * Source text and D1 publication jointly authenticate all four terms.
 */
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {referenceIdentifierKey} from "../app/lib/reference-identifiers.ts";
import {extractClauseNumbers} from "../app/lib/standard-identifiers.ts";
import {QA106_PDFS,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
const deny=x=>{throw Error("QA105_A_TERMS_"+x)};
if(process.env.GITHUB_ACTIONS!=="true"||
   process.env.GITHUB_EVENT_NAME!=="push"||
   process.env.GITHUB_REF!=="refs/heads/feat/issue106-shadow-map-revision-20261122"||
   process.env.QA105_A_TERMS_CONFIRMATION!=="QA_ONLY_PUBLISHED_A_NO_MODELS"||
   process.env.GEMINI_API_KEY!==undefined||
   process.env.GEMINI_BENCHMARK_API_KEY!==undefined||
   process.env.CLERK_SECRET_KEY!==undefined||
   !process.env.CLOUDFLARE_API_TOKEN||
   !process.env.CLOUDFLARE_ACCOUNT_ID)
 deny("CONTEXT_DENIED");
const cfg=JSON.parse(readFileSync("wrangler.qa-pr100-v2.json","utf8"));
if(cfg.d1_databases?.length!==1||
 cfg.d1_databases[0].database_name!=="elevator-help-lease-test-01"||
 cfg.d1_databases[0].database_id!=="02716877-15e3-4478-9e24-f1ba6e5dfb00"||
 cfg.vectorize?.length!==2||
 cfg.vectorize[0].index_name!=="elevator-help-staging-test"||
 cfg.vectorize[1].index_name!=="elevator-help-staging-test-v2"||
 cfg.vars?.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only")
 deny("WRONG_QA_DATABASE");
const a=QA106_PDFS.A,b=QA106_PDFS.B,job=qa106JobKey("A");
const quote=x=>{
 if(!/^[A-Za-z0-9_.:-]{2,180}$/.test(x))deny("BAD_ALLOWLIST");
 return "'"+x+"'";
};
const data=[
 {page:1,kind:"reference",term:referenceIdentifierKey("QA-4711"),label:"QA-4711"},
 {page:1,kind:"clause",term:extractClauseNumbers("QA-1.2.3")[0],label:"1.2.3"},
 {page:2,kind:"reference",term:referenceIdentifierKey("MOCK-DOOR-12"),label:"MOCK-DOOR-12"},
 {page:2,kind:"clause",term:extractClauseNumbers("QA-2.4.6")[0],label:"2.4.6"},
];
if(data.length!==4||data[0].term!=="QA4711"||
  data[1].term!=="1.2.3"||data[2].term!=="MOCKDOOR12"||
  data[3].term!=="2.4.6")deny("PARSER_DRIFT");
function wrangler(sql){
 let raw;
 try{raw=execFileSync("npx",["wrangler","d1","execute",
 "elevator-help-lease-test-01","--remote","--config",
 "wrangler.qa-pr100-v2.json","--json","--command",sql],
 {encoding:"utf8",timeout:100000,maxBuffer:2*1024*1024,
 stdio:["ignore","pipe","ignore"]});}
 catch{deny("REMOTE_D1_UNAVAILABLE")}
 let decoded;
 try{decoded=JSON.parse(raw)}catch{deny("D1_INVALID_JSON")}
 const batches=Array.isArray(decoded)?decoded:[decoded];
 if(batches.some(x=>!Array.isArray(x.results)))deny("D1_INVALID_RESULT");
 return batches.flatMap(x=>x.results);
}
const counts=()=>wrangler(`SELECT
 (SELECT COUNT(*) FROM ingestion_v2_publications p WHERE p.document_id=${quote(a)}
   AND p.job_key=${quote(job)} AND p.evidence_count=2) AS a_pub,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence WHERE document_id=${quote(a)}) AS a_rows,
 (SELECT COUNT(*) FROM ingestion_v2_map_revision_activations WHERE document_id=${quote(b)} AND state='active') AS b_active,
 (SELECT COUNT(*) FROM ingestion_v2_publications WHERE document_id=${quote(b)}) AS b_legacy_pub,
 (SELECT manifest_sha256 FROM ingestion_v2_publications WHERE document_id=${quote(a)}) AS a_manifest,
 (SELECT source_fingerprint FROM ingestion_v2_publications WHERE document_id=${quote(a)}) AS a_source,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms WHERE document_id=${quote(a)}) AS a_total_terms,
 (SELECT COUNT(*) FROM ingestion_v2_evidence_terms t JOIN ingestion_v2_staged_evidence e
   ON e.document_id=t.document_id AND e.generation=t.generation
    AND e.logical_id=t.logical_id AND e.source_fingerprint=t.source_fingerprint
   JOIN ingestion_v2_publications p ON p.document_id=e.document_id
    AND p.active_generation=e.generation AND p.source_fingerprint=e.source_fingerprint
    WHERE t.document_id=${quote(a)}
    AND (t.kind='reference' AND t.term_key='QA4711' AND e.page=1
      OR t.kind='clause' AND t.term_key='1.2.3' AND e.page=1
      OR t.kind='reference' AND t.term_key='MOCKDOOR12' AND e.page=2
      OR t.kind='clause' AND t.term_key='2.4.6' AND e.page=2)) AS expected_terms,
 (SELECT COUNT(*) FROM ingestion_v2_staged_evidence e
   JOIN ingestion_v2_publications p ON p.document_id=e.document_id
     AND p.active_generation=e.generation AND p.source_fingerprint=e.source_fingerprint
   WHERE e.document_id=${quote(a)}
     AND ((e.page=1 AND INSTR(UPPER(e.text),'QA-4711')>0
            AND INSTR(UPPER(e.text),'QA-1.2.3')>0)
       OR (e.page=2 AND INSTR(UPPER(e.text),'MOCK-DOOR-12')>0
            AND INSTR(UPPER(e.text),'QA-2.4.6')>0))) AS source_pages,
 (SELECT COUNT(*) FROM ingestion_global_leases
   WHERE job_key=${quote(job)} AND lease_until_ms>CAST(strftime('%s','now') AS INTEGER)*1000) AS live_a_leases;`)[0];
const asInt=(v,max=4096)=>Number.isSafeInteger(Number(v))&&Number(v)>=0&&Number(v)<=max;
const verify=(r,stage)=>{
 if(!r||!["a_pub","a_rows","b_active","b_legacy_pub",
 "a_total_terms","expected_terms","source_pages","live_a_leases"]
 .every(k=>asInt(r[k]))||!stage.includes(Number(r.expected_terms))||
   r.a_pub!==1||r.a_rows!==2||r.b_active!==1||
   r.b_legacy_pub!==0||r.source_pages!==2||r.live_a_leases!==0||
   typeof r.a_manifest!=="string"||r.a_manifest.length!==64||
   typeof r.a_source!=="string"||r.a_source.length!==64)
   deny("SOURCE_OR_PUBLICATION_DRIFT");
};
const before=counts();
if(before){
 for(const k of ["a_pub","a_rows","b_active","b_legacy_pub",
   "a_total_terms","expected_terms","source_pages","live_a_leases"]){
  const n=Number(before[k]);
  if(Number.isSafeInteger(n)&&n>=0&&n<=4096)
    console.log("QA105_A_PREFLIGHT_"+k.toUpperCase()+"="+n);
 }
 console.log("QA105_A_PREFLIGHT_PUBLICATION_HASH_FORMAT="+(
  /^[a-f0-9]{64}$/.test(String(before.a_manifest||""))));
 console.log("QA105_A_PREFLIGHT_SOURCE_HASH_FORMAT="+(
  /^[a-f0-9]{64}$/.test(String(before.a_source||""))));
}
verify(before,[4]);
// Existing QA A terms were already published (19 indexed entries, four
// exact canonical terms). Never write to D1 as a workaround for a wrongly
// targeted or wrongly normalized QA lookup.
if(Number(before.expected_terms)!==4||
   Number(before.a_total_terms)<4)
 deny("PUBLISHED_TERMS_MISSING_NO_D1_WRITES");
const after=counts();
verify(after,[4]);
if(after.a_manifest!==before.a_manifest||
   after.a_source!==before.a_source||
   after.a_rows!==before.a_rows||
   after.b_active!==before.b_active||
   after.b_legacy_pub!==before.b_legacy_pub||
   after.a_total_terms!==before.a_total_terms)deny("PUBLICATION_OR_TERM_MISMATCH");
console.log("PASS:QA105_A_PUBLISHED_SOURCE_MATCHED_EXACT_PAGES_ONE_TWO");
console.log("PASS:QA105_A_CANONICAL_REFERENCE_AND_CLAUSE_TERMS_ALREADY_PRESENT");
console.log("PASS:QA105_A_AND_B_PUBLICATIONS_UNCHANGED_NO_MODEL");
