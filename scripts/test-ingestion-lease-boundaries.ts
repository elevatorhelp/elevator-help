import assert from "node:assert/strict";
import { guardedIngestionSideEffect } from "../app/lib/ingestion-lease-guard.ts";
const lease={jobKey:"probe",owner:"A",generation:1};
let state={owner:"A",generation:1,expiry:Date.now()+60000};
const db={prepare:()=>({bind:(_job:string,owner:string,generation:number,now:number)=>({first:async()=>state.owner===owner&&state.generation===generation&&state.expiry>now?{valid:1}:null})})};
let writes=0;
await guardedIngestionSideEffect(db,lease,async()=>{writes++;});
assert.equal(writes,1);
state={owner:"B",generation:2,expiry:Date.now()+60000};
await assert.rejects(()=>guardedIngestionSideEffect(db,lease,async()=>{writes++;}),/INGESTION_LEASE_EXPIRED_OR_STALE/);
assert.equal(writes,1,"stale owner must be rejected before write");
state={owner:"A",generation:1,expiry:Date.now()+60000};
await assert.rejects(()=>guardedIngestionSideEffect(db,lease,async()=>{
 writes++;
 // Simulate lease transfer while remote Vectorize request is in flight.
 state={owner:"B",generation:2,expiry:Date.now()+60000};
}),/INGESTION_LEASE_EXPIRED_OR_STALE/);
assert.equal(writes,2);
console.log("Lease pre-write rejection and mid-write ownership-loss detection PASS; in-flight side effect is not rolled back");
