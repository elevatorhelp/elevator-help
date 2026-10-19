// Opt-in Gemini File Search comparison on SYNTHETIC fixtures only.
// Requires GEMINI_API_KEY and GEMINI_FILE_SEARCH_STORE (an isolated prepopulated store).
// Never uploads or scans the private Drive archive.
import { performance } from 'node:perf_hooks';
const key = process.env.GEMINI_API_KEY;
const store = process.env.GEMINI_FILE_SEARCH_STORE;
const model = process.env.GEMINI_FILE_SEARCH_MODEL || 'gemini-2.5-flash';
const cases = [
  { id: 'error-code', question: 'In the synthetic benchmark manual, what does E42 indicate?', expected: 'encoder' },
  { id: 'catalog', question: 'In the synthetic benchmark catalog, which automatic door family is named?', expected: 'varidor' },
];
if (!key || !store) {
  console.log(JSON.stringify({ status: 'skipped', reason: 'Set GEMINI_API_KEY and GEMINI_FILE_SEARCH_STORE for opt-in live comparison; no credentials or store configured.', synthetic: true }));
  process.exit(0);
}
if (!/^fileSearchStores\/[a-zA-Z0-9_-]+$/.test(store)) throw Error('Invalid store name');
const out = [];
for (const test of cases) {
  const start = performance.now();
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: test.question + ' Answer only using retrieved evidence, cite the source; say NOT_FOUND if absent.' }] }], tools: [{ file_search: { file_search_store_names: [store] } }] })
  });
  const body = await response.json();
  if (!response.ok) throw Error('Gemini request failed HTTP ' + response.status + ': ' + JSON.stringify(body.error?.status || 'unknown'));
  const candidates = body.candidates || [];
  const answer = (candidates[0]?.content?.parts || []).map(p => p.text || '').join('');
  const grounding = candidates[0]?.groundingMetadata || {};
  out.push({ id: test.id, correctKeyword: answer.toLowerCase().includes(test.expected), cited: Boolean(grounding.groundingChunks?.length || grounding.groundingSupports?.length), latencyMs: Math.round(performance.now() - start), inputTokens: body.usageMetadata?.promptTokenCount ?? null, outputTokens: body.usageMetadata?.candidatesTokenCount ?? null });
}
console.log(JSON.stringify({ mode: 'gemini-file-search', synthetic: true, results: out }, null, 2));
