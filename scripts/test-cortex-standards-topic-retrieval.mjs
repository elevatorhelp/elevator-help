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
const superseded={...focused,id:"g3:superseded-roof-guard",text:"EN 81-20 5.4.7: superseded claim 0.25 m."};
let publicationChecks=0;
const sandbox={
 console,
 // The isolated VM evaluates searchEvidence without its module imports.
 // Stub only the publication dependency; dedicated publication tests exercise
 // the real D1/generation visibility implementation.
 filterPublishedMatches:async (_db,matches)=>{
  publicationChecks++;
  return matches.filter(match=>match.id!==superseded.id);
 },
 extractStandardCodes:()=>["EN 81-20"],
 extractClauseNumbers:()=>[],
 standardReferenceIdentifiers:()=>[{key:"EN8120"}],
 searchExactArchiveEvidence:async()=>[exact],
 evidenceFromArchiveRow:x=>x,
 evidenceFromMatch:m=>m,
 belongsToRequestedStandard:(x,w)=>x.standardCodes.includes(w[0]),
 buildQueries:q=>[q],
 createQueryBackends:async()=>{semanticCalls++;return [{
  vector:[0.1],vectorize:{query:async()=>({matches:[focused,superseded]})}
 }]},
};
vm.runInNewContext(js,sandbox,{timeout:1000});
const result=await sandbox.__searchEvidence("DIN EN 81-20 Schutzgeländer Fahrkorbdach",{},null,null,null,{});
assert.equal(semanticCalls,1,"generic exact identifier must not suppress semantic retrieval");
assert.ok(result.evidence.some(x=>x.id==="roof-guard"),"topic-specific evidence was lost");
assert.equal(publicationChecks,1,"standards semantic hits must pass through the publication gate");
assert.ok(!result.evidence.some(x=>x.id==="g3:superseded-roof-guard"),"superseded Vectorize evidence entered verified standards context");
console.log("PASS: broad exact standard hit retains topic-focused semantic evidence");

// Citation page is bound to retrieved source metadata, not model-supplied text.
// Exercise the real verifier/formatter in the same isolated VM harness.
const citationStart=src.indexOf("function numberTokens(");
const citationEnd=src.indexOf("\nfunction unverifiedMessage(",citationStart);
assert.ok(citationStart>=0&&citationEnd>citationStart);
const citationJs=ts.transpileModule(src.slice(citationStart,citationEnd)+
 "\nglobalThis.__verifyClaims=verifyClaims;globalThis.__formatAnswer=formatAnswer;",{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
vm.runInNewContext(citationJs,{...sandbox,standardCodesMatch:(a,b)=>a===b},{timeout:1000});
const source={...focused,page:91,sourceName:"PRIVATE_ARCHIVE_PATH_DO_NOT_PRINT"};
const modelClaim={standard:"EN 81-20",clause:"5.4.7",
 text:"Balustrade on car roof: 0.70 m.",evidenceIndex:1,
 evidenceQuote:"EN 81-20 5.4.7: balustrade on car roof, 0.70 m and 1.10 m.",
 page:999};
const verified=sandbox.__verifyClaims({claims:[modelClaim]},[source],[]);
assert.equal(verified.length,1);
assert.equal(verified[0].page,91,"model must not choose the citation page");
const german=sandbox.__formatAnswer(verified,"de");
assert.ok(german.includes("EN 81-20, 5.4.7, S. 91"));
assert.ok(!german.includes("999")&&!german.includes(source.sourceName));
const noPage=sandbox.__verifyClaims({claims:[modelClaim]},[{...source,page:0}],[]);
assert.equal(noPage[0].page,null,"page zero must not become a citation");
assert.ok(!sandbox.__formatAnswer(noPage,"de").includes("S. 0"));
console.log("PASS: source-bound standards page citation, no fabricated page or private source path");
