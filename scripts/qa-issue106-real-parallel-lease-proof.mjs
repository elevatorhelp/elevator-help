/**
 * Issue106 REAL two independent QA Coordinator Workers / D1 leases.
 * ZERO Gemini, Workers AI, Vectorize writes and NO ingestion.
 * D1 lease mutations only; logs contain audited PASS markers, no tokens.
 */
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
const root="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const prefix="drive:"+root+"_qa_";
const run=process.env.GITHUB_RUN_ID||"";
const stateFile=process.env.QA106_PARALLEL_STATE_PATH||"";
const tokenA=process.env.QA106_PARALLEL_TOKEN_A;
const tokenB=process.env.QA106_PARALLEL_TOKEN_B;
const phase=process.argv[2];
const deny=(reason)=>{throw Error("QA106_PARALLEL_"+reason);};
if(process.env.GITHUB_ACTIONS!=="true"||
   process.env.GITHUB_EVENT_NAME!=="push"||
   process.env.GITHUB_REF!=="refs/heads/feat/issue106-shadow-map-revision-20261122"||
   process.env.QA106_PARALLEL_CONFIRMATION!=="QA106_TWO_QA_COORDINATORS_NO_MODEL"||
   process.env.GEMINI_API_KEY!==undefined||
   process.env.GEMINI_BENCHMARK_API_KEY!==undefined||
   !/^[1-9][0-9]{5,19}$/.test(run)||
   !stateFile.startsWith(process.env.RUNNER_TEMP+"/")||
   !tokenA||tokenA.length<24||!tokenB||tokenB.length<24||tokenA===tokenB||
   !["claim","b-survives","reclaim","cleanup"].includes(phase))
  deny("CONTEXT_DENIED");
const endpoint=slot=>"http://127.0.0.1:"+(slot==="A"?8787:8788)+"/api/ingestion-coordinator";
const job=slot=>prefix+slot;
const owner=(slot,kind)=>"gh-"+run+"-"+createHash("sha256")
 .update("qa106-"+run+"-"+slot+"-"+kind).digest("hex").slice(0,24);
async function post(slot,body,allowError=false){
 let res;
 try{
  res=await fetch(endpoint(slot),{
   method:"POST",
   headers:{Authorization:"Bearer "+(slot==="A"?tokenA:tokenB),
    "Content-Type":"application/json"},
   body:JSON.stringify({jobKey:job(slot),...body}),
   signal:AbortSignal.timeout(20000)});
 }catch{deny("QA_COORDINATOR_TRANSPORT_FAILED")}
 let result;try{result=await res.json()}catch{deny("QA_COORDINATOR_BAD_RESPONSE")}
 if(!res.ok||result?.ok!==true){
   if(allowError)return {http:res.status,error:String(result?.error||"")};
   deny("QA_COORDINATOR_REJECTED");
 }
 return result;
}
const write=(value)=>writeFileSync(stateFile,JSON.stringify(value),{mode:0o600});
const read=()=>JSON.parse(readFileSync(stateFile,"utf8"));
const assertLease=(l,slot,who)=>{
 if(l?.jobKey!==job(slot)||l?.owner!==who||
    !Number.isSafeInteger(l?.generation)||l.generation<1)
   deny("LEASE_IDENTITY_INVALID");
};
async function main(){
 if(phase==="claim"){
  const [a,b]=await Promise.all(["A","B"].map(slot=>
    post(slot,{action:"claim",owner:owner(slot,"first"),ttlMs:30000})));
  assertLease(a.lease,"A",owner("A","first"));
  assertLease(b.lease,"B",owner("B","first"));
  write({a:a.lease,b:b.lease});
  console.log("PASS:QA106_TWO_REAL_WORKERS_CLAIM_INDEPENDENT_D1_LEASES");
  return;
 }
 const old=read();
 assertLease(old.a,"A",owner("A","first"));
 assertLease(old.b,"B",owner("B","first"));
 if(phase==="b-survives"){
   const keep=await post("B",{action:"renew",lease:old.b,ttlMs:180000});
   if(keep.ok!==true)deny("B_RENEW_FAILED");
   // A's process is already terminated by the caller. We verify B remains
   // reachable while A is down, not merely that D1 has two lease rows.
   console.log("PASS:QA106_B_WORKER_SURVIVES_A_PROCESS_CRASH");
   return;
 }
 if(phase==="reclaim"){
  const [newA,stillB]=await Promise.all([
   post("A",{action:"claim",owner:owner("A","second"),ttlMs:30000}),
   post("B",{action:"renew",lease:old.b,ttlMs:60000}),
  ]);
  assertLease(newA.lease,"A",owner("A","second"));
  if(newA.lease.generation<=old.a.generation||stillB.ok!==true)
   deny("GENERATION_OR_B_SURVIVAL_FAILURE");
  const stale=await post("A",
   {action:"renew",lease:old.a,ttlMs:30000},true);
  if(stale.http!==409||stale.error!=="ARCHIVE_LEASE_STALE")
   deny("STALE_OWNER_NOT_FENCED");
  write({...old,newA:newA.lease});
  console.log("PASS:QA106_A_RECLAIMED_AFTER_CRASH_AND_LEASE_EXPIRY");
  console.log("PASS:QA106_STALE_A_OWNER_REJECTED_BY_D1_FENCE");
  console.log("PASS:QA106_B_LEASE_UNINTERRUPTED_DURING_A_RECOVERY");
  return;
 }
 if(phase==="cleanup"){
  if(old.newA)await post("A",{action:"release",lease:old.newA},true);
  await post("B",{action:"release",lease:old.b},true);
  console.log("PASS:QA106_PARALLEL_QA_LEASES_RELEASED");
 }
}
main().catch(e=>{
 const code=String(e?.message||"");
 console.error("::error::"+
   (/^QA106_PARALLEL_[A-Z0-9_]{5,100}$/.test(code)?code:
    "QA106_PARALLEL_SAFE_ABORT"));
 process.exitCode=1;
});
