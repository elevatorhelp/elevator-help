// Offline synthetic stress suite. This is a retrieval baseline, NOT the production resolver.
import assert from 'node:assert/strict';
const docs=[
{id:'roof-de-v2',lang:'de',family:'roof',version:2,text:'Fahrkorbdach Geländer Absturzsicherung Normabschnitt TEST-1.1 neue Fassung'},
{id:'roof-de-v1',lang:'de',family:'roof',version:1,text:'Fahrkorbdach Geländer alte Fassung TEST-1.1'},
{id:'roof-en-v2',lang:'en',family:'roof',version:2,text:'Car roof guardrail fall protection clause TEST-1.1 current edition'},
{id:'maker-a-e42',lang:'en',maker:'A',text:'Maker A fault E42 encoder communication failure'},
{id:'maker-b-e42',lang:'en',maker:'B',text:'Maker B fault E42 door lock circuit fault'},
{id:'maker-a-e24',lang:'en',maker:'A',text:'Maker A fault E24 motor temperature warning'},
{id:'catalog-varidor',lang:'it',text:'Catalogo Varidor porte automatiche ricambi'},
{id:'catalog-pump',lang:'it',text:'Catalogo pompe idrauliche'},
{id:'door-en',lang:'en',text:'Door drive maintenance procedure'},
{id:'rope-en',lang:'en',text:'Suspension rope maintenance procedure'},
{id:'access-en',lang:'en',text:'Accessible lift controls clause TEST-7.2'},
{id:'test-7-2-old',lang:'en',text:'Old draft clause TEST-7.2 deprecated'}
];
const tests=[
{id:'roof-de',q:'Fahrkorbdach Geländer',lang:'de',expected:'roof-de-v2'},
{id:'roof-en',q:'car roof guardrail',lang:'en',expected:'roof-en-v2'},
{id:'maker-a-e42',q:'Maker A fault E42',maker:'A',expected:'maker-a-e42'},
{id:'maker-b-e42',q:'Maker B fault E42',maker:'B',expected:'maker-b-e42'},
{id:'maker-a-e24',q:'Maker A fault E24',maker:'A',expected:'maker-a-e24'},
{id:'catalog-it',q:'Catalogo Varidor',expected:'catalog-varidor'},
{id:'pump-it',q:'Catalogo pompe',expected:'catalog-pump'},
{id:'door-de',q:'Wartung Türantrieb',expected:'door-en'},
{id:'rope-de',q:'Wartung Tragseil',expected:'rope-en'},
{id:'access-de',q:'barrierefreie Bedienelemente',expected:'access-en'},
{id:'clause',q:'current clause TEST-7.2 accessible controls',expected:'access-en'},
{id:'roof-current',q:'latest Fahrkorbdach Geländer',lang:'de',expected:'roof-de-v2'},
{id:'missing-fault',q:'Maker A fault E99',maker:'A',expected:null},
{id:'missing-clause',q:'clause TEST-9.9',expected:null},
{id:'missing-maker',q:'Maker C fault E42',maker:'C',expected:null},
{id:'contradiction',q:'Maker B fault E42 encoder communication',maker:'B',expected:'maker-b-e42'}
];
const aliases={'türantrieb':'door drive','tragseil':'suspension rope','barrierefreie':'accessible','bedienelemente':'lift controls','geländer':'guardrail','fahrkorbdach':'car roof'};
const tokenize=s=>s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*/gu)||[];
function retrieve(t,expanded){
 const terms=tokenize(t.q).flatMap(w=>[w,...(expanded&&aliases[w]?tokenize(aliases[w]):[])]);
 const codes=terms.filter(w=>/^e\d+$|^test-\d+(?:\.\d+)?$/.test(w));
 const candidates=docs.filter(d=>!t.maker||d.maker===t.maker).filter(d=>codes.every(c=>tokenize(d.text).includes(c)));
 const ranked=candidates.map(d=>({d,score:terms.reduce((n,w)=>n+(tokenize(d.text).includes(w)?1:0),0)+(t.lang===d.lang?1.5:0)+(d.version||0)*0.15})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 return ranked[0]?.d.id||null;
}
const results=[false,true].map(expanded=>{
 const rows=tests.map(t=>({id:t.id,expected:t.expected,found:retrieve(t,expanded)}));
 return {mode:expanded?'alias-expansion':'exact',synthetic:true,total:rows.length,passed:rows.filter(r=>r.expected===r.found).length,rows};
});
assert(results.every(r=>r.rows.filter(x=>x.expected===null).every(x=>x.found===null)),'Absent evidence must abstain');
assert(results.every(r=>r.rows.filter(x=>x.id.startsWith('maker-') || x.id==='contradiction').every(x=>x.found===x.expected)),'Manufacturer-scoped retrieval must not mix error codes');
assert(results.every(r=>r.rows.filter(x=>x.id==='roof-current').every(x=>x.found===x.expected)),'Current revision must win');
console.log(JSON.stringify({note:'Toy lexical baseline, not actual production RAG',results},null,2));
