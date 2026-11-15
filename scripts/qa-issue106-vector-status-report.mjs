/**
 * Review and print ONLY allowlisted aggregate fields from the temporary QA
 * index diagnostic Worker, never vector IDs, metadata or source text.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const fields=["pending","receipts","legacyMissing","v2Missing",
  "legacyInvalid","v2Invalid","bothValid","bothMissing"];
export function safeQa106IndexSummary(obj,slot){
  if(obj?.ok!==true||obj?.slot!==slot||
     fields.some(k=>!Number.isSafeInteger(obj[k])||
       obj[k]<0||obj[k]>12)||obj.pending<1||
     obj.receipts>obj.pending||
     obj.bothValid+obj.legacyMissing+obj.legacyInvalid>obj.pending||
     obj.bothValid+obj.v2Missing+obj.v2Invalid>obj.pending||
     obj.bothMissing>Math.min(obj.legacyMissing,obj.v2Missing))
      throw Error("QA106_VECTOR_DIAG_UNVERIFIED_RESPONSE");
  return {slot,...Object.fromEntries(fields.map(k=>[k,obj[k]]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let obj;
  try{obj=JSON.parse(readFileSync(process.argv[3],"utf8"))}
  catch{console.error("::error::QA106_VECTOR_DIAG_RESPONSE_UNREADABLE");process.exit(1)}
  try{
    const s=safeQa106IndexSummary(obj,process.argv[2]);
    console.log("QA106_VECTOR_INDEX_"+s.slot+
     " pending="+s.pending+" receipts="+s.receipts+
     " legacy_missing="+s.legacyMissing+
     " v2_missing="+s.v2Missing+
     " legacy_invalid="+s.legacyInvalid+
     " v2_invalid="+s.v2Invalid+
     " both_valid="+s.bothValid+
     " both_missing="+s.bothMissing);
    if(s.legacyInvalid||s.v2Invalid)process.exitCode=2;
  }catch{
    const err=String(obj?.error||"");
    console.error("::error::"+(/^QA106_VECTOR_DIAG_[A-Z_]+$/.test(err)?
      err:"QA106_VECTOR_DIAG_UNVERIFIED_RESPONSE"));
    process.exitCode=1;
  }
}
