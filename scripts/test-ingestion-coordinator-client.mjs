import assert from "node:assert/strict";
import {createIngestionCoordinatorSession,validateCoordinatorState} from "./ingestion-coordinator-client.mjs";
const rootId="1Lu7If9Nt4GUyakB6b6YriOGkvBPkx5i5";
const makeState=(marker="A")=>({version:3,scopes:{[rootId]:{
 files:Object.fromEntries(Array.from({length:125},(_,i)=>["synthetic-file-"+i,
   {fingerprint:marker+i,rawNextChunk:i%5}]))}}});
let version=0,stored=null,lease=null,gen=0,failRenew=false,claims=0,heartbeats=0,clears=0;
let tick=null;
const fetchMock=async(_url,init)=>{
 const body=JSON.parse(init.body);
 let status=200,result={ok:true};
 if(body.jobKey!=="drive:"+rootId){status=403;result={ok:false,error:"INVALID_COORDINATOR_JOB_SCOPE"};}
 else if(body.action==="claim"){
   claims++;
   if(lease){status=409;result={ok:false,error:"ARCHIVE_LEASE_BUSY"};}
   else{gen++;lease={jobKey:body.jobKey,owner:body.owner,generation:gen};result.lease=lease;}
 }else if(body.action==="renew"){
   heartbeats++;
   if(failRenew||!lease||body.lease.owner!==lease.owner){
     status=409;result={ok:false,error:"ARCHIVE_LEASE_STALE"};
   }
 }else if(body.action==="read_checkpoint"){
   if(!lease||body.lease.owner!==lease.owner||!stored){
     status=404;result={ok:false,error:"CHECKPOINT_NOT_FOUND_OR_LEASE_STALE"};
   }else result={ok:true,version,state:stored,checksum:"a".repeat(64)};
 }else if(body.action==="write_checkpoint"){
   if(!lease||body.lease.owner!==lease.owner||body.previousVersion!==version){
     status=409;result={ok:false,error:"CHECKPOINT_CAS_OR_LEASE_STALE"};
   }else{
     version++;stored=structuredClone(body.state);
     result={ok:true,version,checksum:"b".repeat(64)};
   }
 }else if(body.action==="release"){lease=null;}
 else throw Error("UNEXPECTED_ACTION");
 return new Response(JSON.stringify(result),{status,headers:{"Content-Type":"application/json"}});
};
const timer=(fn)=>{tick=fn;return {unref(){}};};
const clear=()=>{clears++;tick=null;};
const params={token:"x".repeat(32),rootId,runId:"42678073650",runAttempt:"1",
 legacyState:makeState(),fetchImpl:fetchMock,setTimer:timer,clearTimer:clear};
assert.throws(()=>validateCoordinatorState({version:3,scopes:{}},rootId),
 /D1_COORDINATOR_INSUFFICIENT_SCOPE_CHECKPOINT/);
await assert.rejects(
 createIngestionCoordinatorSession({...params,bootstrapApproved:false}),
 /CHECKPOINT_NOT_FOUND_OR_LEASE_STALE/,
 "first D1 bootstrap must NEVER occur implicitly");
assert.equal(lease,null,"failed bootstrap releases owner");
const session=await createIngestionCoordinatorSession({...params,bootstrapApproved:true});
assert.equal(session.version,1);assert.equal(version,1);
assert.equal(Object.keys(session.state.scopes[rootId].files).length,125);
await session.assertLive();
const amended=structuredClone(session.state);
amended.scopes[rootId].files["synthetic-file-0"].rawNextChunk=99;
await session.checkpoint(amended);
assert.equal(session.version,2);
assert.equal(stored.scopes[rootId].files["synthetic-file-0"].rawNextChunk,99);
const duplicate=await createIngestionCoordinatorSession({...params,runId:"42678073651",
 legacyState:makeState("CHANGED"),bootstrapApproved:false}).catch(e=>e);
assert.match(duplicate.message,/ARCHIVE_LEASE_BUSY/,"second owner fails closed");
await session.close();assert.equal(lease,null);
const resumed=await createIngestionCoordinatorSession({...params,
 runId:"42678073652",legacyState:makeState("DIFFERENT"),bootstrapApproved:false});
assert.equal(resumed.version,2,"D1 authoritative checkpoint version restored");
assert.equal(resumed.state.scopes[rootId].files["synthetic-file-0"].rawNextChunk,99,
 "local cache must not silently override D1");
assert.notEqual(resumed.lease.generation,session.lease.generation);
failRenew=true;await tick();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(resumed.lost,true);
await assert.rejects(resumed.assertLive(),/D1_COORDINATOR_LEASE_LOST/);
await assert.rejects(resumed.checkpoint(amended),/D1_COORDINATOR_LEASE_LOST/);
await resumed.close();
assert.equal(clears,2);
assert.ok(heartbeats>=2);
console.log("PASS: explicit D1 bootstrap, lease exclusion, heartbeat loss, CAS save, crash recovery from authoritative D1, no legacy state override");
