// Real Cloudflare smoke test. Uses ONLY isolated Cloudflare resources.
// Run from GitHub Actions with CLOUDFLARE_API_TOKEN and ACCOUNT_ID.
import {execFileSync} from "node:child_process";
import {writeFileSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
const database="elevator-help-lease-test-01";
const vectorIndex="elevator-help-staging-test";
const run=process.env.GITHUB_RUN_ID;
if(!/^\d{5,20}$/.test(run||"")) throw Error("GITHUB_RUN_ID required");
if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)throw Error("Cloudflare credentials missing");
const doc="qa-e2e-"+run,owner="qa-"+run,fp="revision-"+run;
const ids=[1,2,3].map(n=>doc+":c"+n);
const command=(args)=>execFileSync("npx",["--yes","wrangler@4.125.0",...args],{encoding:"utf8",timeout:90000,stdio:["ignore","pipe","pipe"]});
const d1=(sql)=>{
 const output=command(["d1","execute",database,"--remote","--command",sql,"--json"]);
 const parsed=JSON.parse(output);
 return (Array.isArray(parsed)?parsed:[parsed]).flatMap(item=>item.results||[]);
};
const q=(v)=>"'"+String(v).replaceAll("'","''")+"'";
const getGen=()=>Number(d1(`SELECT active_generation AS g FROM qa_e2e_publications WHERE document_id=${q(doc)}`)[0]?.g);
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const now=Date.now(), expiry=now+300000;
d1(`CREATE TABLE IF NOT EXISTS qa_e2e_leases(job_key TEXT PRIMARY KEY,owner TEXT NOT NULL,generation INTEGER NOT NULL,lease_until_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS qa_e2e_publications(document_id TEXT PRIMARY KEY,job_key TEXT NOT NULL,active_generation INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS qa_e2e_receipts(document_id TEXT NOT NULL,generation INTEGER NOT NULL,chunk_id TEXT NOT NULL,source_fingerprint TEXT NOT NULL,PRIMARY KEY(document_id,generation,chunk_id));`);
d1(`INSERT INTO qa_e2e_leases VALUES(${q(doc)},${q(owner)},1,${expiry});
INSERT INTO qa_e2e_publications VALUES(${q(doc)},${q(doc)},0,0);
INSERT INTO qa_e2e_receipts VALUES(${q(doc)},1,${q(ids[0])},${q(fp)});
INSERT INTO qa_e2e_receipts VALUES(${q(doc)},1,${q(ids[1])},${q(fp)});`);
const publish=(fingerprint,manifest,worker=owner)=>{
 const expected=JSON.stringify(manifest);
 d1(`UPDATE qa_e2e_publications SET active_generation=1,updated_at_ms=${Date.now()}
 WHERE document_id=${q(doc)} AND job_key=${q(doc)}
 AND EXISTS(SELECT 1 FROM qa_e2e_leases WHERE job_key=${q(doc)}
  AND owner=${q(worker)} AND generation=1 AND lease_until_ms>${Date.now()})
 AND (SELECT COUNT(*) FROM qa_e2e_receipts WHERE document_id=${q(doc)} AND generation=1)=${manifest.length}
 AND NOT EXISTS(SELECT 1 FROM qa_e2e_receipts r WHERE document_id=${q(doc)}
  AND generation=1 AND (r.source_fingerprint<>${q(fingerprint)}
   OR NOT EXISTS(SELECT 1 FROM json_each(${q(expected)}) j WHERE j.value=r.chunk_id)));`);
};
publish(fp,ids);
assert(getGen()===0,"Incomplete document was published");
console.log("PASS D1: partial document blocked");
const path=join(tmpdir(),"qa-e2e-"+run+".ndjson");
const records=ids.map((id,i)=>({id:"g1:"+id,values:Array.from({length:768},(_,k)=>k===i?0.9:0.001),metadata:{sourceFileId:doc,sourceFingerprint:fp}}));
try{
 writeFileSync(path,records.map(v=>JSON.stringify(v)).join("\n")+"\n",{mode:0o600});
 command(["vectorize","upsert",vectorIndex,"--file",path]);
}finally{unlinkSync(path)}
// Writes may be asynchronous in Vectorize; never claim success until retrievable.
let seen=false;
for(let attempt=0;attempt<12;attempt++){
 try{
  const result=command(["vectorize","get-vectors",vectorIndex,"--ids",...records.map(x=>x.id)]);
  if(records.every(v=>result.includes(v.id))){seen=true;break}
 }catch{ /* indexing may still be queued */ }
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5000);
}
assert(seen,"Vectorize failed real read-after-upsert verification");
console.log("PASS Vectorize: 3 staged vectors upserted and retrieved");
d1(`INSERT INTO qa_e2e_receipts VALUES(${q(doc)},1,${q(ids[2])},${q(fp)});`);
publish("wrong-revision",ids);
assert(getGen()===0,"Wrong fingerprint was published");
publish(fp,[ids[0],ids[1],"unexpected"]);
assert(getGen()===0,"Wrong chunk manifest was published");
publish(fp,ids,"stale-worker");
assert(getGen()===0,"Stale worker published");
publish(fp,ids);
assert(getGen()===1,"Complete verified document did not publish");
console.log("PASS D1: fingerprint, exact IDs, lease owner and atomic final publish");
console.log("PASS: isolated Cloudflare D1 + Vectorize real integration smoke test");
