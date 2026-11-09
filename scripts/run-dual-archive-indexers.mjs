// Explicit, bounded canary: two independent OS indexer processes inside ONE
// existing GitHub Actions concurrency group (the serial job cannot overlap).
// Not a substitute for cross-entrypoint D1 fencing in the final architecture.
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readIngestionState,writeIngestionState} from "./drive-ingest.mjs";
import {assertShardState} from "./archive-sharding.mjs";
import {splitLatestSerialState,mergeCanaryCheckpoints} from "./dual-indexer-checkpoint.mjs";

const execFileAsync=promisify(execFile);
const legacyPath=".ingestion-state/drive.json";
const paths=[".ingestion-state/dual-shard-0.json",".ingestion-state/dual-shard-1.json"];
const calls=[30,30],maxFiles=[1,1];

function assertCanaryEnvironment(env=process.env) {
  if(env.GITHUB_ACTIONS!=="true" || env.GITHUB_EVENT_NAME!=="workflow_dispatch" ||
     env.DUAL_CANARY_ENABLED!=="true" || !/^[1-9]\d{5,19}$/.test(env.GITHUB_RUN_ID||"") ||
     env.DUAL_CANARY_RUN_ID!==env.GITHUB_RUN_ID ||
     env.DUAL_CANARY_CONFIRMATION!=="APPROVE_2_DOCUMENTS_SHARED_60_CALLS") {
    throw Error("DUAL_CANARY_NOT_EXPLICITLY_AUTHORIZED");
  }
  if(env.DRIVE_FOLDER_ID &&
     env.DRIVE_FOLDER_ID!=="1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5")
    throw Error("DUAL_CANARY_UNAPPROVED_DRIVE_SCOPE");
  if(!env.GOOGLE_SERVICE_ACCOUNT_JSON||!env.ELEVATOR_INGESTION_TOKEN)
    throw Error("DUAL_CANARY_INGESTION_CREDENTIALS_UNAVAILABLE");
  if((env.INGEST_ENDPOINT||"https://elevator.help/api/drive-ingest-batch")!=="https://elevator.help/api/drive-ingest-batch" ||
     (env.DOCUMENT_MAP_ENDPOINT||"https://elevator.help/api/document-map-ingest")!=="https://elevator.help/api/document-map-ingest")
    throw Error("DUAL_CANARY_PRODUCTION_ORIGIN_MISMATCH");
}

async function runProcess(shard) {
  const env={...process.env,ARCHIVE_SHARD_INDEX:String(shard),ARCHIVE_SHARD_COUNT:"2",
    STATE_PATH:paths[shard],MAX_FILES:String(maxFiles[shard]),MAX_GEMINI_CALLS:String(calls[shard]),
    ALLOW_EMPTY_INGESTION_STATE:"false",FORCE_REINGEST:"false"};
  const {stdout}=await execFileAsync(process.execPath,["scripts/drive-ingest.mjs"],{
    env,timeout:14*60*1000,maxBuffer:2_000_000,windowsHide:true,
  });
  const summary=/Done\. Attempted (\d+) file\(s\); (\d+) failed;[^\r\n]*Gemini calls reserved: (\d+)\/(\d+)\./.exec(stdout);
  console.log(`shard_${shard}_finished=${!!summary}; shard_${shard}_attempted=${summary?.[1]??"unavailable"}; shard_${shard}_failed=${summary?.[2]??"unavailable"}; shard_${shard}_gemini_calls=${summary?.[3]??"unavailable"}/${calls[shard]}`);
  if(!summary)throw Error("DUAL_CANARY_SUMMARY_MISSING");
  return {attempted:Number(summary[1]),failed:Number(summary[2]),calls:Number(summary[3])};
}

async function main() {
  assertCanaryEnvironment();
  const legacy=await readIngestionState(legacyPath,false);
  // A missing, empty or wrong-scope cache must not trigger mass reindexing.
  // The observed live archive already contains >100 indexed documents.
  const root=process.env.DRIVE_FOLDER_ID||"1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
  const published=legacy.scopes?.[root]?.files;
  if(!published||typeof published!=="object"||Array.isArray(published)||
     Object.keys(published).length<100) {
    throw Error("DUAL_CANARY_CHECKPOINT_TOO_SMALL_OR_WRONG_SCOPE");
  }
  const shards=splitLatestSerialState(legacy);
  for (let s=0;s<2;s++) await writeIngestionState(shards[s],paths[s]);
  // Two processes truly run concurrently, each with a DISJOINT document-ID set,
  // in the same GitHub concurrency group as the serial schedule.
  const outcomes=await Promise.allSettled([runProcess(0),runProcess(1)]);
  // Even if one worker fails, preserve the other worker's checkpoint and
  // reconcile to the legacy path for safe serial-schedule continuation.
  const saved=await Promise.all(paths.map(path=>readIngestionState(path,false)));
  saved.forEach((x,s)=>assertShardState(x,s,2));
  const merged=mergeCanaryCheckpoints(legacy,saved[0],saved[1]);
  await writeIngestionState(merged,legacyPath);
  console.log("PASS: checkpoint from BOTH shards merged to serial fallback");
  if(outcomes.some(x=>x.status==="rejected")) {
    console.error("DUAL_CANARY_WORKER_FAILED; checkpoint reconciled; no raw source errors logged");
    process.exitCode=1;
  } else {
    const total=outcomes.reduce((sum,x)=>sum+x.value.calls,0);
    if(total>60)throw Error("DUAL_CANARY_AGGREGATE_CALL_LIMIT_EXCEEDED");
    console.log(`PASS: dual indexers executed concurrently; aggregate Gemini calls ${total}/60`);
  }
}
main().catch(error=>{
  const safe=typeof error?.message==="string"&&/^(?:DUAL_CANARY_|INGESTION_|INVALID_|PARALLEL_|CROSS_SHARD_)/.test(error.message)?
    error.message.split(":")[0]:"DUAL_CANARY_UNEXPECTED_FAILURE";
  console.error("::error::"+safe);
  process.exitCode=1;
});
