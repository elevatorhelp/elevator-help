// Opt-in, bounded Gemini File Search evidence benchmark on synthetic data only.
// Requires GEMINI_API_KEY and GEMINI_FILE_SEARCH_STORE; never reads private archives.
import {performance} from 'node:perf_hooks';
const key=process.env.GEMINI_API_KEY;
const store=process.env.GEMINI_FILE_SEARCH_STORE;
const model=process.env.GEMINI_FILE_SEARCH_MODEL || 'gemini-3.8-flash';
const cases=[
 {id:'fault-e42',q:'According to the synthetic benchmark manual, what does fault E42 mean?',expect:'encoder communication',evidence:'encoder communication'},
 {id:'fault-e24',q:'According to the synthetic benchmark manual, what does fault E24 mean?',expect:'motor temperature',evidence:'motor temperature'},
 {id:'catalog',q:'Which automatic door family is named in the synthetic benchmark catalog?',expect:'varidor',evidence:'varidor'},
 {id:'unknown-fault',q:'According to the synthetic benchmark manual, what does fault E99 mean?',absent:true},
 {id:'unknown-clause',q:'According to the synthetic benchmark manual, what does clause TEST-9.9 require?',absent:true},
];
if(!key || !store){
 console.log(JSON.stringify({status:'skipped',reason:'Credentials and isolated store are required for live calls',synthetic:true}));
 process.exit(0);
}
if(!/^fileSearchStores\/[a-zA-Z0-9_-]+$/.test(store)) throw Error('Invalid store name');
const results=[];
for(const test of cases){
 const start=performance.now();
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{
  method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},
  body:JSON.stringify({
   contents:[{role:'user',parts:[{text:test.q+' Answer using ONLY retrieved document evidence. If the answer is not stated, reply exactly NOT_FOUND. Do not invent a citation.'}]}],
   tools:[{file_search:{file_search_store_names:[store]}}],
   generationConfig:{maxOutputTokens:256,temperature:0}
  })
 });
 const body=await response.json();
 if(!response.ok)throw Error('Gemini HTTP '+response.status+': '+JSON.stringify({status:body.error?.status,message:body.error?.message,code:body.error?.code}));
 const candidate=body.candidates?.[0]||{};
 const answer=(candidate.content?.parts||[]).map(p=>p.text||'').join('').trim();
 const grounding=candidate.groundingMetadata||{};
 const chunks=grounding.groundingChunks||[];
 const supports=grounding.groundingSupports||[];
 const evidence=chunks.map(c=>JSON.stringify(c)).join(' ').toLowerCase();
 const correct=test.absent ? answer==='NOT_FOUND' : answer.toLowerCase().includes(test.expect);
 const cited=chunks.length>0 || supports.length>0;
 results.push({
  id:test.id,correct,cited,sourceEvidenceMatch:test.absent?null:evidence.includes(test.evidence),
  abstained:answer==='NOT_FOUND',latencyMs:Math.round(performance.now()-start),
  inputTokens:body.usageMetadata?.promptTokenCount??null,
  outputTokens:body.usageMetadata?.candidatesTokenCount??null,
  totalTokens:body.usageMetadata?.totalTokenCount??null,
  groundingChunks:chunks.length,groundingSupports:supports.length,
  answerPreview:answer.slice(0,250)
 });
}
console.log(JSON.stringify({mode:'gemini-file-search',synthetic:true,model,store,results,summary:{
 cases:results.length,correct:results.filter(x=>x.correct).length,
 citedPositive:results.filter(x=>!x.abstained&&x.cited).length,
 falseAnswersOnAbsent:results.filter(x=>['unknown-fault','unknown-clause'].includes(x.id)&&!x.abstained).length
}},null,2));
