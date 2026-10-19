// Offline, synthetic retrieval benchmark. No archive files or API keys are transmitted.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const fixtures = [
  { id: 'standard-de', language: 'de', question: 'Welche Anforderungen gelten für den Schutz am Fahrkorbdach?', expected: 'STD-ROOF', terms: ['fahrkorbdach', 'schutz'], corpus: [
    { id: 'STD-ROOF', text: 'Fahrkorbdach Schutz Geländer Absturzgefahr. Car roof protection guardrail.' },
    { id: 'CAT-DOOR', text: 'Door operator spare parts and motors.' }] },
  { id: 'error-code', language: 'en', question: 'What does drive fault E42 mean?', expected: 'FAULT-E42', terms: ['e42'], corpus: [
    { id: 'FAULT-E42', text: 'Drive fault E42: simulated encoder communication failure.' },
    { id: 'FAULT-E24', text: 'Drive fault E24: simulated motor temperature warning.' }] },
  { id: 'catalog-it', language: 'it', question: 'Catalogo porte automatiche Varidor?', expected: 'CAT-VARIDOR', terms: ['varidor'], corpus: [
    { id: 'CAT-VARIDOR', text: 'Catalogo Varidor porte automatiche, azionamento e ricambi.' },
    { id: 'CAT-PUMP', text: 'Catalogo pompe idrauliche.' }] },
  { id: 'cross-language', language: 'de', question: 'Wie lautet die Wartungsanweisung für den Türantrieb?', expected: 'MANUAL-DOOR', terms: ['türantrieb'], corpus: [
    { id: 'MANUAL-DOOR', text: 'Door drive maintenance instructions and service procedure.' },
    { id: 'MANUAL-ROPE', text: 'Suspension rope maintenance instructions.' }] },
];
const aliases = { 'türantrieb': ['door drive'], 'fahrkorbdach': ['car roof'], 'schutz': ['protection'] };
function find(fixture, translate = false) {
  const q = fixture.question.toLocaleLowerCase();
  const queryTerms = fixture.terms.filter(t => q.includes(t));
  const expanded = queryTerms.flatMap(t => [t, ...(translate ? (aliases[t] ?? []) : [])]);
  const ranked = fixture.corpus.map(d => ({ id: d.id, score: expanded.reduce((s,t) => s + Number(d.text.toLocaleLowerCase().includes(t)), 0) }))
    .sort((a,b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].id : null;
}
for (const mode of ['exact', 'translation-dictionary']) {
  const started = performance.now();
  const results = fixtures.map(f => ({ case: f.id, expected: f.expected, found: find(f, mode !== 'exact') }));
  const hits = results.filter(r => r.expected === r.found).length;
  console.log(JSON.stringify({ mode, synthetic: true, cases: fixtures.length, hits, recallAt1: hits / fixtures.length, elapsedMs: +(performance.now()-started).toFixed(3), results }));
  assert.equal(results.length, fixtures.length);
}
console.log('No Google File Search API calls or production data used. This is a harness baseline, not a vendor comparison.');
