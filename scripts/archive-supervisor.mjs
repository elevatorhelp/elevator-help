import {appendFileSync} from "node:fs";
import {inspectArchiveInventory} from "./drive-ingest.mjs";
try {
  if(!process.env.GITHUB_OUTPUT||!process.env.GITHUB_STEP_SUMMARY)throw Error("MISSING_OUTPUT");
  const s=await inspectArchiveInventory();
  const status=s.workRequired?"WORK_REQUIRED":"STANDBY";
  const pct=Math.floor(100*s.complete/s.total);
  const report={status,...s,percent:pct,checkedAt:new Date().toISOString()};
  console.log("ARCHIVE_SUPERVISOR "+JSON.stringify(report));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## Archive supervisor — "+status+"\n\n"+
    "Complete: "+s.complete+"/"+s.total+" ("+pct+"%) · Pending documents: "+s.pending+" · Missing source records: "+s.missing+"\n\n"+
    "Phase backlog (overlapping counts): Evidence "+s.evidence+", RAW "+s.raw+", Map "+s.map+"\n\n"+
    "Gemini calls by supervisor: 0\n");
  appendFileSync(process.env.GITHUB_OUTPUT,"work_required="+s.workRequired+"\n");
} catch {
  console.error("::error::ARCHIVE_SUPERVISOR_SCAN_FAILED_CLOSED");
  process.exitCode=1;
}
