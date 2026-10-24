import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import vm from "node:vm";

// Execute the actual searchEvidence implementation, not a reimplementation.
// A valid standard-code hit is NOT evidence of the requested technical topic.
const src=readFileSync(new URL("../app/lib/cortex-standards-engine.ts",import.meta.url),"utf8");
const start=src.indexOf("async function searchEvidence(");
const end=src.indexOf("\nfunction numberTokens(",start);
assert.ok(start>=0&&end>start);
const extracted=src.slice(start,end);
const js=ts.transpileModule(extracted+"\nglobalThis.__searchEvidence=searchEvidence;",{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
let semanticCalls=0;
const exact={id:"generic-intro",text:"EN 81-20 is an elevator standard.",score:2,standardCodes:["EN 81-20"],sourceName:"EN81-20",page:1};
const focused={id:"roof-guard",text:"EN 81-20 5.4.7: balustrade on car roof, 0.70 m and 1.10 m.",score:0.9,standardCodes:["EN 81-20"],sourceName:"EN81-20",page:90};
const sandbox={
 console,
 extractStandardCodes:()=>["EN 81-20"],
 extractClauseNumbers:()=>[],
 standardReferenceIdentifiers:()=>[{key:"EN8120"}],
 searchArchiveEvidenceIndex:async()=>[exact],
 evidenceFromArchiveRow:x=>x,
 evidenceFromMatch:m=>m,
 belongsToRequestedStandard:(x,w)=>x.standardCodes.includes(w[0]),
 buildQueries:q=>[q],
 createQueryBackends:async()=>{semanticCalls++;return [{
  vector:[0.1],vectorize:{query:async()=>({matches:[focused]})}
 }]},
};
vm.runInNewContext(js,sandbox,{timeout:1000});
const result=await sandbox.__searchEvidence("DIN EN 81-20 Schutzgeländer Fahrkorbdach",{},null,null,null,{});
assert.equal(semanticCalls,1,"generic exact identifier must not suppress semantic retrieval");
assert.ok(result.evidence.some(x=>x.id==="roof-guard"),"topic-specific evidence was lost");
console.log("PASS: broad exact standard hit retains topic-focused semantic evidence");
