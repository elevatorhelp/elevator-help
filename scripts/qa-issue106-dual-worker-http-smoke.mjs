/**
 * Two ACTUAL remote Cloudflare QA Worker HTTP sessions, two independent
 * coordinator leases concurrently. NO Gemini key, Google data or Vectorize.
 * Runs only on one explicitly pinned QA push branch.
 */
import {randomBytes} from "node:crypto";
import {QA106_ROOT,qa106JobKey} from "./qa-issue106-parallel-guard.mjs";
const ROOT=QA106_ROOT;
const RUN=process.env.GITHUB_RUN_ID||"";
const TOKENS={A:process.env.QA106_SMOKE_TOKEN_A,B:process.env.QA106_SMOKE_TOKEN_B};
const ORIGINS={A:"http://127.0.0.1:8787",B:"http://127.0.0.1:8788"};
const owners={A:"gh-"+RUN+"-"+randomBytes(12).toString("hex"),B:"gh-"+RUN+"-"+randomBytes(12).toString("hex")};
const leases={};
const check=(v,code)=>{if(!v)throw Error(code);};
async function coordinator(slot,action,extra={},expect=true){
  const resp=await fetch(ORIGINS[slot]+"/api/ingestion-coordinator",{
    method:"POST",
    headers:{Authorization:"Bearer "+TOKENS[slot],"Content-Type":"application/json"},
    body:JSON.stringify({action,jobKey:qa106JobKey(slot),...extra}),
    signal:AbortSignal.timeout(25000)
  });
  const data=await resp.json().catch(()=>null);
  check(expect?resp.ok&&data?.ok===true:!resp.ok&&data?.ok===false,
    "QA106_HTTP_"+action.toUpperCase()+"_UNEXPECTED");
  return data;
}
async function main(){
  check(process.env.GITHUB_ACTIONS==="true"&&
    process.env.GITHUB_EVENT_NAME==="push"&&
    process.env.GITHUB_REF==="refs/heads/qa/issue106-main-aligned-manual-parallel-20261115"&&
    /^[1-9][0-9]{5,19}$/.test(RUN)&&
    TOKENS.A?.length>=24&&TOKENS.B?.length>=24&&TOKENS.A!==TOKENS.B,
    "QA106_SMOKE_UNAPPROVED");
  check(qa106JobKey("A")!==qa106JobKey("B")&&
    !qa106JobKey("A").includes("1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5"),
    "QA106_SMOKE_WRONG_SCOPE");
  const [a,b]=await Promise.all([
    coordinator("A","claim",{owner:owners.A,ttlMs:180000}),
    coordinator("B","claim",{owner:owners.B,ttlMs:180000}),
  ]);
  leases.A=a.lease;leases.B=b.lease;
  check(leases.A?.jobKey===qa106JobKey("A")&&
     leases.B?.jobKey===qa106JobKey("B")&&
     leases.A.owner===owners.A&&leases.B.owner===owners.B,
     "QA106_SMOKE_DUAL_LEASES_NOT_GRANTED");
  console.log("PASS: two real remote Cloudflare QA Workers concurrently hold independent D1 leases");
  await Promise.all([
    coordinator("A","renew",{lease:leases.A,ttlMs:180000}),
    coordinator("B","renew",{lease:leases.B,ttlMs:180000}),
  ]);
  console.log("PASS: both concurrent D1 owners independently renew their own leases");
  // Sending B's job key to A's scoped Worker must be denied.
  const cross=await fetch(ORIGINS.A+"/api/ingestion-coordinator",{
    method:"POST",
    headers:{Authorization:"Bearer "+TOKENS.A,"Content-Type":"application/json"},
    body:JSON.stringify({action:"renew",jobKey:qa106JobKey("B"),
      lease:leases.B,ttlMs:180000}),
    signal:AbortSignal.timeout(15000)
  });
  check(cross.status===403,"QA106_SMOKE_CROSS_JOB_NOT_DENIED");
  await coordinator("A","release",{lease:leases.A});
  await coordinator("A","renew",{lease:leases.A,ttlMs:180000},false);
  await coordinator("B","renew",{lease:leases.B,ttlMs:180000});
  console.log("PASS: A stale owner denied and B remains independently active");
  console.log("QA106_TWO_REAL_QA_WORKER_HTTP_LEASES_PASS_NO_GEMINI");
}
try{await main();}
catch(e){
  const c=String(e?.message||"");
  console.error("::error::"+(/^QA106_[A-Z0-9_]+$/.test(c)?c:"QA106_SMOKE_FAILED"));
  process.exitCode=1;
}finally{
  await Promise.all(["A","B"].map(async s=>{
    if(leases[s]){try{await coordinator(s,"release",{lease:leases[s]});}catch{}}
  }));
}
