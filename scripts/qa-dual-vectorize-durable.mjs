/**
 * Isolated physical Cloudflare Vectorize V2 QA, with a durable redacted trace.
 * This is a VECTOR STORE readback test, not a claim of two complete PDF indexers.
 * Runs only in GitHub Actions on explicitly named isolated test indexes.
 */
import {createHash} from "node:crypto";
import {writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";

const INDEXES = ["elevator-help-staging-test", "elevator-help-staging-test-v2"];
const DIMENSIONS = 768;
const reportDir = process.env.RUNNER_TEMP || ".";
const reportPath = join(reportDir, "dual-vectorize-durable-qa.json");
const run = process.env.GITHUB_RUN_ID || "";
const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
const report = {
  schema: 1, purpose: "isolated-dual-vector-store-readback",
  run: /^[0-9]{5,20}$/.test(run) ? run : "invalid",
  attempt: /^[0-9]{1,4}$/.test(attempt) ? attempt : "invalid",
  indexes: INDEXES, records: 2, dimensions: DIMENSIONS,
  productionChanged: false, geminiCalls: 0,
  checks: [], status: "RUNNING"
};
const note = (check, outcome) => {
  report.checks.push({check, outcome});
  console.log(outcome + ": " + check);
};
const persist = () => {
  mkdirSync(reportDir, {recursive:true});
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", {mode:0o600});
};
const fail = (code) => { throw new Error(code); };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const fingerprint = createHash("sha256").update("qa:" + run + ":" + attempt).digest("hex").slice(0,32);
const epoch = Number(run).toString(36);
const makeId = layer => "v2" + (layer==="raw"?"r":"m") + "-" + epoch + "-" +
  createHash("sha256").update("qa:" + run + ":" + attempt + ":" + layer).digest("hex").slice(0,40);
const rawId = makeId("raw"), mapId = makeId("map");
const vectors = [
  {id:rawId, values:Array.from({length:DIMENSIONS},(_,i)=>i===0?1:0),
   metadata:{sourceFileId:"qa-synthetic",sourceFingerprint:fingerprint,stagedGeneration:Number(run),
    stagedLayer:"raw",status:"active",contentType:"archive-raw",text:"SYNTHETIC_QA",
    fileName:"synthetic-qa.txt",sourcePath:"qa-only",page:1,chunkIndex:0}},
  {id:mapId, values:Array.from({length:DIMENSIONS},(_,i)=>i===1?1:0),
   metadata:{sourceFileId:"qa-synthetic",sourceFingerprint:fingerprint,stagedGeneration:Number(run),
    stagedLayer:"map",status:"active",contentType:"document-map",text:"SYNTHETIC_QA",
    fileName:"synthetic-qa.txt",sourcePath:"qa-only",page:1,pageEnd:1}}
];
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const endpoint = index => "https://api.cloudflare.com/client/v4/accounts/" +
  encodeURIComponent(account) + "/vectorize/v2/indexes/" + encodeURIComponent(index);
async function api(index, op, body) {
  const url = endpoint(index) + "/" + op;
  let response;
  try {
    response=await fetch(url,{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,
        "Content-Type":op==="insert"?"application/x-ndjson":"application/json"},
      body:op==="insert" ? body : JSON.stringify(body),
      signal:AbortSignal.timeout(25000)
    });
  } catch {
    fail("QA_VECTORIZE_" + op.toUpperCase() + "_TRANSPORT");
  }
  let parsed;
  try { parsed = await response.json(); } catch {
    fail("QA_VECTORIZE_" + op.toUpperCase() + "_NON_JSON");
  }
  if (!response.ok || parsed?.success!==true)
    fail("QA_VECTORIZE_" + op.toUpperCase() + "_HTTP_" + response.status);
  return parsed.result;
}
async function readBoth(index) {
  const values=await api(index,"get_by_ids",{ids:[rawId,mapId]});
  if(!Array.isArray(values))fail("QA_VECTORIZE_GET_RESULT_INVALID");
  if(values.length!==2)return false;
  for(const candidate of vectors){
    const record=values.find(value=>value.id===candidate.id);
    if(!record || !Array.isArray(record.values) || record.values.length!==DIMENSIONS ||
       !record.metadata || record.metadata.sourceFingerprint!==fingerprint ||
       record.metadata.stagedLayer!==candidate.metadata.stagedLayer ||
       record.metadata.stagedGeneration!==Number(run) ||
       record.metadata.sourceFileId!=="qa-synthetic")return false;
  }
  return true;
}
async function pollUntil(check,limitMs){
  const start=Date.now();
  while(Date.now()-start < limitMs){
    if(await check())return true;
    await sleep(5000);
  }
  return false;
}
async function main(){
  if(process.env.GITHUB_ACTIONS!=="true"||
     !["push","workflow_dispatch"].includes(process.env.GITHUB_EVENT_NAME)||
     !/^[0-9]{5,20}$/.test(run) ||
     !/^[0-9]{1,4}$/.test(attempt))
    fail("QA_ONLY_GITHUB_ACTIONS_REQUIRED");
  if(!/^[a-fA-F0-9]{32}$/.test(account||"") || !token || token.length<20)
    fail("QA_CLOUDFLARE_CREDENTIALS_MISSING");
  if(rawId.length>64||mapId.length>64)fail("QA_VECTOR_ID_TOO_LONG");

  for(const index of INDEXES){
    const ndjson=vectors.map(v=>JSON.stringify(v)).join("\n")+"\n";
    const inserted=await api(index,"insert",ndjson);
    if(!inserted?.mutationId)fail("QA_VECTORIZE_MUTATION_RECEIPT_MISSING");
    note(index + " insert acknowledged", "PASS");
  }
  for(const index of INDEXES){
    if(!await pollUntil(()=>readBoth(index),120000))
      fail("QA_VECTORIZE_ASYNC_READBACK_TIMEOUT");
    note(index + " two-layer metadata and 768d readback", "PASS");
  }
  note("Both isolated indexes have matching staged IDs", "PASS");
}
async function cleanup(){
  for(const index of INDEXES){
    try{
      const receipt=await api(index,"delete_by_ids",{ids:[rawId,mapId]});
      if(!receipt?.mutationId)fail("QA_VECTORIZE_CLEANUP_RECEIPT_MISSING");
      const absent=await pollUntil(async()=>{
        const rows=await api(index,"get_by_ids",{ids:[rawId,mapId]});
        return Array.isArray(rows)&&rows.length===0;
      },90000);
      if(!absent)fail("QA_VECTORIZE_CLEANUP_TIMEOUT");
      note(index + " synthetic records removed", "PASS");
    }catch{
      note(index + " cleanup requires manual audit", "FAIL");
      report.cleanupFailure=true;
    }
  }
}
let mainError=null;
try{await main();}
catch(error){
  mainError=error instanceof Error && /^QA_[A-Z0-9_]+$/.test(error.message)
    ? error.message:"QA_UNKNOWN_FAILURE";
  note("remote dual-index physical proof", "FAIL");
}finally{
  if(account&&token&&/^[0-9]{5,20}$/.test(run))await cleanup();
  if(!mainError&&!report.cleanupFailure){
    report.status="PASS";
    note("dual-index vector store readback and cleanup", "PASS");
  }else report.status="FAIL";
  if(mainError)report.error=mainError;
  persist();
}
if(report.status!=="PASS")process.exitCode=1;
