export type RouterResult = {
  intent: "troubleshooting" | "documentation" | "standard" | "planning" | "general_technical" | "unknown";
  questionLanguage: string | null; preferredSourceLanguage: string | null;
  manufacturer: string | null; productFamily: string | null; controller: string | null;
  faultCode: string | null; faultFamily: string | null; faultName: string | null;
  topics: string[]; components: string[]; confidence: "high" | "medium" | "low";
  needsClarification: boolean; clarificationQuestion: string | null;
  searchStrategy: "filtered" | "semantic_broad" | "clarify_first";
  normalizedQuestion?: string | null; interpretation?: string | null;
};

function buildRouterPrompt(question: string) { return `
You are the semantic understanding and routing brain of elevator.help, a product exclusively for elevator/lift engineering.
FIRST understand what an elevator technician, engineer, architect or homeowner means. THEN decide where the system should search. Do not answer the technical question itself.

SEMANTIC RESCUE RULES:
1. Assume elevator context by default. Users do not need to repeat elevator, lift or Aufzug.
2. Repair spelling, grammar, shorthand, Baustelle language, incomplete phrases and mixed-language wording when the intended elevator meaning is reasonably clear.
3. Examples: "Geländer auf dem kabin" can mean a guardrail on the Fahrkorbdach; "Öl für Schienen" in this product normally means lubricant/oil for elevator guide rails.
4. Put the clean technical interpretation in normalizedQuestion, in the user's language. Preserve identifiers, model names, fault codes and manufacturer names exactly.
5. If you had to materially reconstruct a malformed question, put a short natural-language interpretation in interpretation. Otherwise interpretation may be null.
6. Clarification is a LAST RESORT. Ask only when two or more materially different interpretations would lead to different or safety-relevant answers, or an essential manufacturer/model/configuration is genuinely required. Do not ask merely because spelling is poor.
7. Never invent a manufacturer, controller, component, fault code, fault name, standard clause or numeric value.
8. A fault number alone is not enough to identify a manufacturer/controller.
9. Detect question language (de, en, fa, hr, ru, ar, tr). Final answers must use that language.
10. Prefer source documentation in the same language, with de/en fallback when needed.
11. topics/components are retrieval concepts, not guesses about facts.
12. Treat Kabine/Kabin, Fahrkorb, Schacht, Schachtwand, Schachttür, Schwelle, Schachtgrube, Schachtkopf, Führungsschiene, Gegengewicht, Puffer, Geländer, car, cabin, shaft, sill, guide rail and similar terms as elevator context.
13. Questions asking minimum/maximum/permissible distance, clearance or dimension between elevator components are standards-related unless clearly only a project preference.
14. Ordinary technical questions such as lubrication, guide rails, rollers, shoes, doors, brakes, ropes, maintenance, adjustment or component selection are general_technical/documentation/troubleshooting as appropriate. They must not fail just because no manufacturer/controller was stated.
15. For general technical questions without a specific manufacturer/controller, use semantic_broad and do NOT clarify_first unless a reliable answer genuinely depends on the missing detail.

Known mapping only when evidence is explicit/strong:
- LSU is a faultFamily, not faultCode.
- NEW LIFT / FST / FST-3 mappings: 14 LSU-ANFAHRPROBLEM, 15 LSU-LAUFZEITUEBERWCH, 16 LSU-GEBERFEHLER, 17 LSU-KABIN. KOMMUNIKTN, 18 LSU-GESCHW. ENDSCHLTR, 19 LSU-ZONE FEHLT, 20 LSU-BREMSE FEHLER, 21 LSU-MOTOR FEHLER, 22 LSU-ZWANGSHALT, 23 LSU-NOTENDSCHALTER.
- A distinctive signature of active Vorsteuerung/pre-control plus car not starting may strongly indicate NEW LIFT FST-3 LSU-ANFAHRPROBLEM, unless the user identifies a conflicting manufacturer/controller. Never infer numeric faultCode from symptoms.
- A bare "Fehler 14" must preserve faultCode 14 but ask for manufacturer/controller.

Return ONLY valid JSON:
{"intent":"troubleshooting|documentation|standard|planning|general_technical|unknown","questionLanguage":"de","preferredSourceLanguage":"de","manufacturer":null,"productFamily":null,"controller":null,"faultCode":null,"faultFamily":null,"faultName":null,"topics":[],"components":[],"confidence":"high|medium|low","needsClarification":false,"clarificationQuestion":null,"searchStrategy":"filtered|semantic_broad|clarify_first","normalizedQuestion":"...","interpretation":null}
User question:\n${question}`; }

function parseRouterJson(text: string): any { const t=text.trim(); try{return JSON.parse(t)}catch{} const f=t.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim(); try{return JSON.parse(f)}catch{} const a=f.indexOf("{"); const b=f.lastIndexOf("}"); if(a>=0&&b>a)return JSON.parse(f.slice(a,b+1)); throw new Error("Router returned invalid JSON"); }

async function callRouterModel(question:string, apiKey:string){ const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:buildRouterPrompt(question)}]}],generationConfig:{responseMimeType:"application/json",temperature:0}})}); if(!response.ok)throw new Error(`Gemini router error: ${await response.text()}`); const data:any=await response.json(); const text=data?.candidates?.[0]?.content?.parts?.[0]?.text; if(!text)throw new Error("Gemini router returned no content"); return text as string; }

function hasKnownAnfahrproblemSignature(question:string){const n=question.toLowerCase();const e=/pre[-\s]?control/.test(n)&&/(active|activated|on)/.test(n)&&/(car|cabin|elevator|lift)/.test(n)&&/(does\s+not|doesn't|won't|will\s+not|fails?\s+to|not)\s+(start|move|run)/.test(n);const g=/vorsteuer/.test(n)&&/aktiv/.test(n)&&/(fahrkorb|kabine|aufzug)/.test(n)&&/(fährt\s+nicht\s+an|faehrt\s+nicht\s+an|startet\s+nicht|läuft\s+nicht\s+an|laeuft\s+nicht\s+an)/.test(n);const p=/(پیش[‌\s-]?کنترل|پری[‌\s-]?کنترل|vorsteuerung)/i.test(question)&&/فعال/.test(question)&&/(کابین|آسانسور)/.test(question)&&/(راه\s*نمی|حرکت\s*نمی|شروع\s*نمی)/.test(question);return e||g||p;}
function applyKnownSymptomMappings(route:any,question:string){if(!hasKnownAnfahrproblemSignature(question))return;const m=String(route.manufacturer||"").toLowerCase();const c=String(route.controller||"").toLowerCase();if((m&&!m.includes("new lift"))||(c&&!c.includes("fst")))return;Object.assign(route,{intent:"troubleshooting",manufacturer:"NEW LIFT",productFamily:"FST",controller:"FST-3",faultFamily:"LSU",faultName:"LSU-ANFAHRPROBLEM",confidence:"high",needsClarification:false,clarificationQuestion:null,searchStrategy:"filtered"});}
function normalizeRoute(route:any,question:string):RouterResult{if(typeof route.faultFamily==="string"&&route.faultFamily.startsWith("LSU-")){route.faultName=route.faultName??route.faultFamily;route.faultFamily="LSU"}if(route.faultCode==="LSU"){route.faultCode=null;route.faultFamily="LSU"}if(!route.faultFamily&&typeof route.faultName==="string"&&route.faultName.startsWith("LSU-"))route.faultFamily="LSU";if(route.faultCode!=null&&!/^\d+$/.test(String(route.faultCode)))route.faultCode=null;const fm=question.match(/\b(?:fehler|fault|error|code)?\s*(\d{1,4})\b/i);if(fm&&!route.faultCode)route.faultCode=fm[1];const bare=/^\s*(?:fehler|fault|error|code)?\s*\d{1,4}\s*[?.!]*\s*$/i.test(question);if(bare){Object.assign(route,{manufacturer:null,productFamily:null,controller:null,faultFamily:null,faultName:null,needsClarification:true,searchStrategy:"clarify_first",confidence:"low",clarificationQuestion:route.clarificationQuestion??"Which elevator manufacturer or controller is this fault code from?"})}else applyKnownSymptomMappings(route,question);const ql=route.questionLanguage??(/^[\x00-\x7F]*$/.test(question)?"en":null);return{intent:route.intent??"unknown",questionLanguage:ql,preferredSourceLanguage:route.preferredSourceLanguage??ql,manufacturer:route.manufacturer??null,productFamily:route.productFamily??null,controller:route.controller??null,faultCode:route.faultCode??null,faultFamily:route.faultFamily??null,faultName:route.faultName??null,topics:Array.isArray(route.topics)?route.topics:[],components:Array.isArray(route.components)?route.components:[],confidence:route.confidence??"low",needsClarification:Boolean(route.needsClarification),clarificationQuestion:route.clarificationQuestion??null,searchStrategy:route.searchStrategy??"semantic_broad",normalizedQuestion:typeof route.normalizedQuestion==="string"&&route.normalizedQuestion.trim()?route.normalizedQuestion.trim():question,interpretation:typeof route.interpretation==="string"&&route.interpretation.trim()?route.interpretation.trim():null};}

function deterministicStandardsRoute(question:string):RouterResult|null{const explicit=/\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question)||/\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question)||/(استاندارد|نورم|نُرم)/i.test(question);const domain=/(aufzug|fahrkorb|kabin(?:e|en)?|kabin\b|schacht(?:wand|tür|grube|kopf)?|schwelle|führungsschiene|gegengewicht|puffer|landing\s+door|shaft(?:\s+wall)?|car\s+sill|cabin|guide\s+rail|counterweight)/i.test(question)||/(آسانسور|کابین|چاه(?:\s*آسانسور)?|دیواره\s*چاه|ریل|وزنه\s*تعادل)/i.test(question);const dim=/(\bmin(?:imum)?\.?\b|\bmax(?:imum)?\.?\b|mindest|höchst|maximal|zulässig|abstand|clearance|distance|dimension|maß|mas+|فاصله|حداقل|حداکثر)/i.test(question);if(!(explicit||(domain&&dim)))return null;const ql=/[؀-ۿ]/.test(question)?"fa":/\b(wer|was|warum|wie|wieviel|wie\s+viel|min|max|abstand|aufzug|fahrkorb|kabin|schacht|schwelle|norm|normen)\b/i.test(question)?"de":"en";return{intent:"standard",questionLanguage:ql,preferredSourceLanguage:ql,manufacturer:null,productFamily:null,controller:null,faultCode:null,faultFamily:null,faultName:null,topics:dim?["clearance","dimensions"]:[],components:[],confidence:"high",needsClarification:false,clarificationQuestion:null,searchStrategy:"semantic_broad",normalizedQuestion:question,interpretation:null};}

export async function routeQuestion(question:string):Promise<RouterResult>{const apiKey=process.env.GEMINI_API_KEY;if(!apiKey){const fallback=deterministicStandardsRoute(question);if(fallback)return fallback;throw new Error("GEMINI_API_KEY is missing");}let lastError:unknown;for(let attempt=0;attempt<2;attempt+=1){try{return normalizeRoute(parseRouterJson(await callRouterModel(question,apiKey)),question)}catch(error){lastError=error}}const fallback=deterministicStandardsRoute(question);if(fallback)return fallback;
// A temporary Gemini routing failure must not kill an otherwise answerable elevator question.
// Keep the fallback deliberately broad: downstream Gemini research/synthesis remains the brain,
// while exact standards claims are still handled by the deterministic standards path above.
const ql=/[؀-ۿ]/.test(question)?"fa":/\b(wer|was|warum|wie|wann|welch|für|ist|sind|öl|schiene|geländer|kabin|schacht|tür|bremse|seil)\b/i.test(question)?"de":"en";
return {intent:"general_technical",questionLanguage:ql,preferredSourceLanguage:ql,manufacturer:null,productFamily:null,controller:null,faultCode:null,faultFamily:null,faultName:null,topics:[],components:[],confidence:"low",needsClarification:false,clarificationQuestion:null,searchStrategy:"semantic_broad",normalizedQuestion:question,interpretation:null};}
