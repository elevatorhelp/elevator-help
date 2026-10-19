// Twelve synthetic retrieval regression cases; no network, keys, or private archive.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const docs = [
  {id:'STD-ROOF-DE', lang:'de', text:'Fahrkorbdach Schutz Gelaender Absturzgefahr. Normabschnitt TEST-1.1.'},
  {id:'STD-ROOF-EN', lang:'en', text:'Car roof protection guardrail fall hazard. Clause TEST-1.1.'},
  {id:'FAULT-E42', lang:'en', text:'Simulated drive fault E42 means encoder communication failure.'},
  {id:'FAULT-E24', lang:'en', text:'Simulated drive fault E24 means motor temperature warning.'},
  {id:'CAT-VARIDOR', lang:'it', text:'Catalogo Varidor porte automatiche, azionamento e ricambi.'},
  {id:'CAT-PUMP', lang:'it', text:'Catalogo pompe idrauliche.'},
  {id:'MANUAL-DOOR', lang:'en', text:'Door drive maintenance instructions and service procedure.'},
  {id:'MANUAL-ROPE', lang:'en', text:'Suspension rope maintenance instructions.'},
  {id:'STD-ACCESS', lang:'en', text:'Accessible lift controls. Clause TEST-7.2.'},
];
const cases = [
  {id:'roof-de', query:'Schutz am Fahrkorbdach', expected:'STD-ROOF-DE', terms:['fahrkorbdach','schutz']},
  {id:'roof-en', query:'car roof protection guardrail', expected:'STD-ROOF-EN', terms:['car roof','guardrail']},
  {id:'fault-e42', query:'What does error E42 mean?', expected:'FAULT-E42', terms:['e42']},
  {id:'fault-e24', query:'What does fault E24 mean?', expected:'FAULT-E24', terms:['e24']},
  {id:'catalog-it', query:'Catalogo porte Varidor', expected:'CAT-VARIDOR', terms:['varidor']},
  {id:'pump-it', query:'Catalogo pompe idrauliche', expected:'CAT-PUMP', terms:['pompe']},
  {id:'door-de-en', query:'Wartung Tuerantrieb', expected:'MANUAL-DOOR', terms:['tuerantrieb']},
  {id:'rope-de-en', query:'Wartung Tragseil', expected:'MANUAL-ROPE', terms:['tragseil']},
  {id:'access-de-en', query:'barrierefreie Aufzug Bedienelemente', expected:'STD-ACCESS', terms:['bedienelemente']},
  {id:'clause', query:'Which document has clause TEST-7.2?', expected:'STD-ACCESS', terms:['test-7.2']},
  {id:'missing-fault', query:'What does fault E99 mean?', expected:null, terms:['e99']},
  {id:'missing-clause', query:'Find clause TEST-9.9', expected:null, terms:['test-9.9']},
];
const aliases = {
  tuerantrieb:['door drive'], tragseil:['suspension rope'],
  bedienelemente:['lift controls'], fahrkorbdach:['car roof'],
  schutz:['protection']
};
function retrieve(test, expand) {
  const terms = test.terms.flatMap(t=>[t,...(expand ? aliases[t] || [] : [])]);
  const ranked = docs.map(doc=>({
    id:doc.id,
    score:terms.reduce((n,t)=>n+Number(doc.text.toLowerCase().includes(t)),0)
  })).sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>0 ? ranked[0].id : null;
}
for(const expand of [false,true]){
  const start=performance.now();
  const results=cases.map(test=>({id:test.id,expected:test.expected,found:retrieve(test,expand)}));
  const passed=results.filter(r=>r.expected===r.found).length;
  const missing=results.filter(r=>r.expected===null);
  assert(missing.every(r=>r.found===null),'Missing evidence must abstain');
  console.log(JSON.stringify({
    mode:expand?'alias-expansion':'exact', synthetic:true, total:results.length,
    passed, accuracy:passed/results.length, abstentionsCorrect:missing.length,
    elapsedMs:+(performance.now()-start).toFixed(3), results
  },null,2));
}
