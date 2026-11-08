import assert from "node:assert/strict";
const base="http://127.0.0.1:8787";
const token=process.env.QA_RUN_TOKEN;
if(!token)throw Error("QA_RUN_TOKEN_MISSING");
const documentId="qa61-"+String(process.env.GITHUB_RUN_ID||"").replace(/[^0-9]/g,"")+"-"+Date.now().toString(36);
const fp="drive-revision-"+documentId;
const ids=Array.from({length:11},(_,i)=>documentId+":chunk-"+i);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function send(path,payload){
 const response=await fetch(base+path,{method:"POST",headers:{"content-type":"application/json","x-qa-token":token},body:JSON.stringify({documentId,...payload})});
 const data=await response.json();return {status:response.status,...data};
}
function check(result,code,label){assert.equal(result.status,code,label+": "+JSON.stringify(result));}
const owner="qa-worker-a-"+Date.now().toString(36);
const acquired=await send("/lease",{owner});check(acquired,200,"lease acquisition");
const lease=acquired.lease;
console.log("PASS: real Worker lease acquired");
const chunks=ids.map((id,i)=>({id,sourceFingerprint:fp,ordinal:i}));
const b1=await send("/batch",{lease,chunks:chunks.slice(0,8)});check(b1,200,"batch 1");
let p=await send("/publish",{lease,sourceFingerprint:fp,manifestIds:ids});
check(p,409,"incomplete publication");
console.log("PASS: incomplete 8/11 chunks rejected");
const before=await send("/read",{lease,ids:b1.ids});check(before,200,"pre-publish visibility");
assert.deepEqual(before.visibleIds,[]);
console.log("PASS: unpublished chunks invisible");
const b2=await send("/batch",{lease,chunks:chunks.slice(8)});check(b2,200,"batch 2");
p=await send("/publish",{lease,sourceFingerprint:"incorrect",manifestIds:ids});check(p,409,"wrong fingerprint");
p=await send("/publish",{lease,sourceFingerprint:fp,manifestIds:ids.slice(0,-1).concat(documentId+":wrong")});check(p,409,"wrong manifest");
console.log("PASS: mismatched revision and same-count wrong manifest rejected");
const stale=await send("/publish",{lease:{...lease,owner:"qa-stale"},sourceFingerprint:fp,manifestIds:ids});
check(stale,409,"stale lease");
let found=0;
for(let attempt=0;attempt<20;attempt++){
 const res=await send("/read",{lease,ids:[...b1.ids,...b2.ids]});check(res,200,"vector read");
 found=res.found;
 if(found===ids.length)break;
 await sleep(5000);
}
assert.equal(found,ids.length,"all 11 staged Vectorize vectors must be retrievable");
const stillHidden=await send("/read",{lease,ids:[...b1.ids,...b2.ids]});
assert.equal(stillHidden.visibleIds.length,0,"no prepublication leak");
console.log("PASS: all 11 vectors persisted across real batches and hidden before publish");
p=await send("/publish",{lease,sourceFingerprint:fp,manifestIds:ids});check(p,200,"exact publication");
assert.equal(p.published,true);
const visible=await send("/read",{lease,ids:[...b1.ids,...b2.ids]});check(visible,200,"post publish");
assert.equal(visible.visibleIds.length,ids.length);
console.log("PASS: published vectors visible after atomic D1 CAS");
const expired=await send("/expire",{lease});check(expired,200,"expire lease");
const later=await send("/lease",{owner:"qa-worker-b-"+Date.now().toString(36)});check(later,200,"takeover");
assert.ok(later.lease.generation>lease.generation);
const old=await send("/publish",{lease,sourceFingerprint:fp,manifestIds:ids});check(old,409,"stale worker");
const still=await send("/read",{lease:later.lease,ids:[...b1.ids,...b2.ids]});check(still,200,"prior published after takeover");
assert.equal(still.visibleIds.length,ids.length);
console.log("PASS: takeover fences old Worker and retains last published generation");
console.log("PASS: PR61 REAL WORKER integration: lease, 2 batches, Vectorize, manifest CAS, retrieval, takeover");
