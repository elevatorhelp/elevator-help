export type EvidenceNeed = "direct" | "internal" | "standard" | "web_current";
export type RouterResult = {
  intent: "troubleshooting" | "documentation" | "standard" | "planning" | "general_technical" | "unknown";
  evidenceNeed: EvidenceNeed;
  questionLanguage: string | null; preferredSourceLanguage: string | null;
  manufacturer: string | null; productFamily: string | null; controller: string | null;
  faultCode: string | null; faultFamily: string | null; faultName: string | null;
  topics: string[]; components: string[]; confidence: "high" | "medium" | "low";
  needsClarification: boolean; clarificationQuestion: string | null;
  searchStrategy: "filtered" | "semantic_broad" | "clarify_first";
  normalizedQuestion?: string | null; interpretation?: string | null;
};

type RouterContextItem = { role?: string; content?: string; text?: string };
function compactRouterContext(items: RouterContextItem[] = []) {
  return items.slice(-6).map((item) => {
    const role = item.role === "assistant" || item.role === "model" ? "Assistant" : "User";
    const raw = typeof item.content === "string" ? item.content : typeof item.text === "string" ? item.text : "";
    const text = raw.replace(/\s+/g, " ").trim().slice(0, 500);
    return text ? `${role}: ${text}` : "";
  }).filter(Boolean).join("\n");
}

function buildRouterPrompt(question: string, context: RouterContextItem[] = []) { const recent=compactRouterContext(context); return `
You are the semantic understanding and routing brain of elevator.help, a product exclusively for elevator/lift engineering.
FIRST understand what an elevator technician, engineer, architect or homeowner means. THEN decide what evidence is needed. Do not answer the technical question itself.

SEMANTIC RESCUE RULES:
1. Assume elevator context by default. Users do not need to repeat elevator, lift or Aufzug.
2. Repair spelling, grammar, shorthand, Baustelle language, incomplete phrases and mixed-language wording when the intended elevator meaning is reasonably clear.
3. Examples: "Geländer auf dem kabin" can mean a guardrail on the Fahrkorbdach; "Öl für Schienen" in this product normally means lubricant/oil for elevator guide rails.
4. Put the clean technical interpretation in normalizedQuestion, in the user's language. Preserve identifiers, model names, fault codes and manufacturer names exactly.
5. If you had to materially reconstruct a malformed question, put a short natural-language interpretation in interpretation. Otherwise interpretation may be null.
6. Clarification is a LAST RESORT. Ask only when two or more materially different interpretations would lead to different or safety-relevant answers, or essential project/manufacturer/model/configuration data is genuinely required. Do not ask merely because spelling is poor.
7. Never invent a manufacturer, controller, component, fault code, fault name, standard clause or numeric value.
8. A fault number alone is not enough to identify a manufacturer/controller.
9. Detect question language (de, en, fa, hr, ru, ar, tr). Final answers must use that language.
10. Prefer source documentation in the same language, with de/en fallback when needed.
11. topics/components are retrieval concepts, not guesses about facts.
12. Treat Kabine/Kabin, Fahrkorb, Schacht, Schachtwand, Schachttür, Schwelle, Schachtgrube, Schachtkopf, Führungsschiene, Gegengewicht, Puffer, Geländer, car, cabin, shaft, sill, guide rail and similar terms as elevator context.
13. Route by USER INTENT, not merely by technical nouns. Explicit requests for a standard/norm/clause, or questions asking a binding minimum/maximum/permissible clearance between defined elevator components, are standards-related. A request to design, size, choose or determine suitable shaft/cabin/door/headroom/pit dimensions for a project is planning, even though standards may later be consulted as one evidence source.
14. Planning questions must not be sent directly to the standards engine merely because they contain words such as shaft, dimension, minimum, headroom or pit. Planning should first identify the engineering objective and missing project parameters; standards are a downstream constraint/evidence source when relevant.
15. Ordinary technical questions such as lubrication, guide rails, rollers, shoes, doors, brakes, ropes, maintenance, adjustment or component selection are general_technical/documentation/troubleshooting as appropriate. They must not fail just because no manufacturer/controller was stated.
16. For general technical and planning questions without a specific manufacturer/controller, use semantic_broad and do NOT clarify_first unless a reliable answer genuinely depends on missing detail.
17. Examples: "I am an architect. Help me determine suitable elevator shaft dimensions for my project" => planning. "What does EN 81-20 say about shaft clearances?" => standard. "What is the minimum permitted distance between the car and shaft wall?" => standard. "What shaft size should I plan for an 8-person accessible lift?" => planning.
18. Use RECENT CONVERSATION only to resolve the CURRENT USER MESSAGE. In a follow-up such as "what about that clearance if the shaft is glass?", carry forward the relevant component, manufacturer/controller, fault, standard/safety intent or engineering subject from the recent conversation when it is clearly the same topic.
19. normalizedQuestion must be a self-contained resolved version of the CURRENT USER MESSAGE, not a transcript or summary of the conversation. Do not copy unrelated earlier facts into it.
20. Do not let an old topic override an explicit topic change in the current message. If the reference is genuinely ambiguous between materially different earlier subjects, clarification is appropriate.
21. Set evidenceNeed to the smallest evidence class that can reliably support this turn: direct for ordinary conversation/explanation that does not require a source-specific or current fact; internal for manufacturer/controller/fault/manual/document-specific facts; standard for normative/safety-critical binding limits, exact mandatory values or standards clauses; web_current only when the user explicitly asks for current/latest/online/web information. Do not use web_current merely because internal evidence might miss.
22. evidenceNeed is advisory and conservative. Deterministic application guards can override it for safety/normative claims. Manufacturer/controller/fault/manual-specific claims should prefer internal. Simple explanatory turns should be allowed to stay direct.

Known mapping only when evidence is explicit/strong:
- LSU is a faultFamily, not faultCode.
- NEW LIFT / FST / FST-3 mappings: 14 LSU-ANFAHRPROBLEM, 15 LSU-LAUFZEITUEBERWCH, 16 LSU-GEBERFEHLER, 17 LSU-KABIN. KOMMUNIKTN, 18 LSU-GESCHW. ENDSCHLTR, 19 LSU-ZONE FEHLT, 20 LSU-BREMSE FEHLER, 21 LSU-MOTOR FEHLER, 22 LSU-ZWANGSHALT, 23 LSU-NOTENDSCHALTER.
- A distinctive signature of active Vorsteuerung/pre-control plus car not starting may strongly indicate NEW LIFT FST-3 LSU-ANFAHRPROBLEM, unless the user identifies a conflicting manufacturer/controller. Never infer numeric faultCode from symptoms.
- A bare "Fehler 14" must preserve faultCode 14 but ask for manufacturer/controller.

Return ONLY valid JSON:
{"intent":"troubleshooting|documentation|standard|planning|general_technical|unknown","evidenceNeed":"direct|internal|standard|web_current","questionLanguage":"de","preferredSourceLanguage":"de","manufacturer":null,"productFamily":null,"controller":null,"faultCode":null,"faultFamily":null,"faultName":null,"topics":[],"components":[],"confidence":"high|medium|low","needsClarification":false,"clarificationQuestion":null,"searchStrategy":"filtered|semantic_broad|clarify_first","normalizedQuestion":"...","interpretation":null}
RECENT CONVERSATION:\n${recent||"(none)"}\nCURRENT USER MESSAGE:\n${question}`; }

function parseRouterJson(text: string): any { const t=text.trim(); try{return JSON.parse(t)}catch{} const f=t.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"").trim(); try{return JSON.parse(f)}catch{} const a=f.indexOf("{"); const b=f.lastIndexOf("}"); if(a>=0&&b>a)return JSON.parse(f.slice(a,b+1)); throw new Error("Router returned invalid JSON"); }

async function callRouterModel(question:string, apiKey:string, context:RouterContextItem[]=[]){ const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:buildRouterPrompt(question,context)}]}],generationConfig:{responseMimeType:"application/json",temperature:0}})}); if(!response.ok)throw new Error(`Gemini router error: ${await response.text()}`); const data:any=await response.json(); const text=data?.candidates?.[0]?.content?.parts?.[0]?.text; if(!text)throw new Error("Gemini router returned no content"); return text as string; }

function hasKnownAnfahrproblemSignature(question:string){const n=question.toLowerCase();const e=/pre[-\s]?control/.test(n)&&/(active|activated|on)/.test(n)&&/(car|cabin|elevator|lift)/.test(n)&&/(does\s+not|doesn't|won't|will\s+not|fails?\s+to|not)\s+(start|move|run)/.test(n);const g=/vorsteuer/.test(n)&&/aktiv/.test(n)&&/(fahrkorb|kabine|aufzug)/.test(n)&&/(fährt\s+nicht\s+an|faehrt\s+nicht\s+an|startet\s+nicht|läuft\s+nicht\s+an|laeuft\s+nicht\s+an)/.test(n);const p=/(پیش[‌\s-]?کنترل|پری[‌\s-]?کنترل|vorsteuerung)/i.test(question)&&/فعال/.test(question)&&/(کابین|آسانسور)/.test(question)&&/(راه\s*نمی|حرکت\s*نمی|شروع\s*نمی)/.test(question);return e||g||p;}
function applyKnownSymptomMappings(route:any,question:string){if(!hasKnownAnfahrproblemSignature(question))return;const m=String(route.manufacturer||"").toLowerCase();const c=String(route.controller||"").toLowerCase();if((m&&!m.includes("new lift"))||(c&&!c.includes("fst")))return;Object.assign(route,{intent:"troubleshooting",evidenceNeed:"internal",manufacturer:"NEW LIFT",productFamily:"FST",controller:"FST-3",faultFamily:"LSU",faultName:"LSU-ANFAHRPROBLEM",confidence:"high",needsClarification:false,clarificationQuestion:null,searchStrategy:"filtered"});}
function deterministicEvidenceNeed(route:any):EvidenceNeed{if(route.intent==="standard")return "standard";if(route.manufacturer||route.controller||route.faultCode||route.faultFamily||route.intent==="documentation"||route.intent==="troubleshooting")return "internal";return "direct";}
function normalizeRoute(route:any,question:string):RouterResult{if(typeof route.faultFamily==="string"&&route.faultFamily.startsWith("LSU-")){route.faultName=route.faultName??route.faultFamily;route.faultFamily="LSU"}if(route.faultCode==="LSU"){route.faultCode=null;route.faultFamily="LSU"}if(!route.faultFamily&&typeof route.faultName==="string"&&route.faultName.startsWith("LSU-"))route.faultFamily="LSU";if(route.faultCode!=null&&!/^\d+$/.test(String(route.faultCode)))route.faultCode=null;const fm=question.match(/\b(?:fehler|fault|error|code)?\s*(\d{1,4})\b/i);if(fm&&!route.faultCode)route.faultCode=fm[1];const bare=/^\s*(?:fehler|fault|error|code)?\s*\d{1,4}\s*[?.!]*\s*$/i.test(question);if(bare){Object.assign(route,{manufacturer:null,productFamily:null,controller:null,faultFamily:null,faultName:null,evidenceNeed:"internal",needsClarification:true,searchStrategy:"clarify_first",confidence:"low",clarificationQuestion:route.clarificationQuestion??"Which elevator manufacturer or controller is this fault code from?"})}else applyKnownSymptomMappings(route,question);const ql=route.questionLanguage??(/^[\x00-\x7F]*$/.test(question)?"en":null);const allowed=new Set(["direct","internal","standard","web_current"]);const evidenceNeed:EvidenceNeed=allowed.has(route.evidenceNeed)?route.evidenceNeed:deterministicEvidenceNeed(route);return{intent:route.intent??"unknown",evidenceNeed,questionLanguage:ql,preferredSourceLanguage:route.preferredSourceLanguage??ql,manufacturer:route.manufacturer??null,productFamily:route.productFamily??null,controller:route.controller??null,faultCode:route.faultCode??null,faultFamily:route.faultFamily??null,faultName:route.faultName??null,topics:Array.isArray(route.topics)?route.topics:[],components:Array.isArray(route.components)?route.components:[],confidence:route.confidence??"low",needsClarification:Boolean(route.needsClarification),clarificationQuestion:route.clarificationQuestion??null,searchStrategy:route.searchStrategy??"semantic_broad",normalizedQuestion:typeof route.normalizedQuestion==="string"&&route.normalizedQuestion.trim()?route.normalizedQuestion.trim():question,interpretation:typeof route.interpretation==="string"&&route.interpretation.trim()?route.interpretation.trim():null};}

function deterministicStandardsRoute(question:string):RouterResult|null{
  const explicit=/\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question)||/\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question)||/(استاندارد|نورم|نُرم)/i.test(question);
  const planning=/(architect|architecture|planung|planen|projekt|project|design|designen|auslegen|dimensionieren|suitable|geeignet|empfehl|recommend|what\s+(shaft|cabin|door)\s+size|which\s+(shaft|cabin|door)\s+size|ابعاد\s+مناسب|طراحی|پروژه|معمار)/i.test(question);
  if(planning&&!explicit)return null;
  const domain=/(aufzug|fahrkorb|kabin(?:e|en)?|kabin\b|schacht(?:wand|tür|grube|kopf)?|schwelle|führungsschiene|gegengewicht|puffer|landing\s+door|shaft(?:\s+wall)?|car\s+sill|cabin|guide\s+rail|counterweight)/i.test(question)||/(آسانسور|کابین|چاه(?:\s*آسانسور)?|دیواره\s*چاه|ریل|وزنه\s*تعادل)/i.test(question);
  const bindingDim=/(\bmin(?:imum)?\.?\b|\bmax(?:imum)?\.?\b|mindest|höchst|maximal|zulässig|permissible|allowed|abstand|clearance|distance|فاصله|حداقل|حداکثر)/i.test(question);
  if(!(explicit||(domain&&bindingDim)))return null;
  const ql=/[؀-ۿ]/.test(question)?"fa":/\b(wer|was|warum|wie|wieviel|wie\s+viel|min|max|abstand|aufzug|fahrkorb|kabin|schacht|schwelle|norm|normen)\b/i.test(question)?"de":"en";
  return{intent:"standard",evidenceNeed:"standard",questionLanguage:ql,preferredSourceLanguage:ql,manufacturer:null,productFamily:null,controller:null,faultCode:null,faultFamily:null,faultName:null,topics:bindingDim?["clearance","dimensions"]:[],components:[],confidence:"high",needsClarification:false,clarificationQuestion:null,searchStrategy:"semantic_broad",normalizedQuestion:question,interpretation:null};
}

export async function routeQuestion(question:string, context:RouterContextItem[]=[]):Promise<RouterResult>{const apiKey=process.env.GEMINI_API_KEY;if(!apiKey){const fallback=deterministicStandardsRoute(question);if(fallback)return fallback;throw new Error("GEMINI_API_KEY is missing");}let lastError:unknown;for(let attempt=0;attempt<2;attempt+=1){try{return normalizeRoute(parseRouterJson(await callRouterModel(question,apiKey,context)),question)}catch(error){lastError=error}}const fallback=deterministicStandardsRoute(question);if(fallback)return fallback;
const ql=/[؀-ۿ]/.test(question)?"fa":/\b(wer|was|warum|wie|wann|welch|für|ist|sind|öl|schiene|geländer|kabin|schacht|tür|bremse|seil)\b/i.test(question)?"de":"en";
return {intent:"general_technical",evidenceNeed:"direct",questionLanguage:ql,preferredSourceLanguage:ql,manufacturer:null,productFamily:null,controller:null,faultCode:null,faultFamily:null,faultName:null,topics:[],components:[],confidence:"low",needsClarification:false,clarificationQuestion:null,searchStrategy:"semantic_broad",normalizedQuestion:question,interpretation:null};}