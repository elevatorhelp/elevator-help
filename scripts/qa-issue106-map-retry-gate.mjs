/**
 * Issue106: the runner's round label is not the actual ingestion phase.
 * A round named 'raw' can select Map after a prior checkpoint. Match a
 * known recoverable Map timeout ONLY when the private worker log actually
 * confirms Map as the selected phase. No raw log text is emitted.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
export function canRetryExistingMapWithoutGemini(exitCode,privateLog){
  if(!Number.isSafeInteger(exitCode)||exitCode<=0)return false;
  const log=String(privateLog||"");
  return /Ingestion phase preference: (?:evidence|raw|map); selected: map\b/.test(log)&&
    /\bV2_MAP_(?:VECTOR_READBACK_TIMEOUT|PENDING_VECTOR_READBACK)\b/.test(log);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const exitCode=Number(process.argv[2]);
  let log="";
  try{log=readFileSync(process.argv[3],"utf8");}catch{}
  process.exitCode=canRetryExistingMapWithoutGemini(exitCode,log)?0:1;
}
