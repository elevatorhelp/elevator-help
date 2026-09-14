export type RouterResult = {
  intent:
    | "troubleshooting"
    | "documentation"
    | "standard"
    | "planning"
    | "general_technical"
    | "unknown";
  questionLanguage: string | null;
  preferredSourceLanguage: string | null;
  manufacturer: string | null;
  productFamily: string | null;
  controller: string | null;
  faultCode: string | null;
  faultFamily: string | null;
  faultName: string | null;
  topics: string[];
  components: string[];
  confidence: "high" | "medium" | "low";
  needsClarification: boolean;
  clarificationQuestion: string | null;
  searchStrategy: "filtered" | "semantic_broad" | "clarify_first";
};

function buildRouterPrompt(question: string) {
  return `
You are the routing layer of an elevator technical knowledge base.

Your task is NOT to answer the user's technical question.
Your task is to determine where the system should search.

Important rules:

1. Never invent a manufacturer, controller, component, fault code or fault name.
2. A fault number alone is NOT enough to identify a manufacturer or controller.
3. A technical term or a distinctive symptom combination may suggest a manufacturer/controller only if there is strong evidence.
4. If identification is uncertain, mark it as uncertain.
5. Distinguish troubleshooting questions from documentation, standards, planning and general technical questions.
6. Return ONLY valid JSON.
7. Detect the language of the user's question and use a short ISO-style language code when possible, e.g. de, en, fa, hr, ru, ar, tr.
8. Prefer technical documentation in the same language as the user's question when available.
9. If matching documentation is unavailable in that language, the retrieval query may later be translated into the available source language.
10. The final answer must be generated in the user's original question language.
11. faultFamily is the fault family or prefix, such as "LSU".
12. faultCode must contain ONLY a numeric fault code explicitly stated by the user, such as "14", "15" or "20".
13. Never put a fault family such as "LSU" into faultCode.
14. If the user does not explicitly state a numeric fault code, faultCode MUST be null.
15. faultName is the specific named fault, such as "LSU-ANFAHRPROBLEM".
16. faultName may be inferred from symptoms only when there is strong evidence.
17. Do not infer a numeric faultCode from symptoms. Even if the symptoms strongly match a known fault, keep faultCode null unless the user explicitly provided the number.
18. If the user only mentions "LSU", set faultFamily to "LSU" and faultCode to null.
19. If the user provides a number such as "14" without enough manufacturer/controller context, preserve faultCode as "14" but ask for clarification instead of assuming the controller.
20. topics and components should describe useful retrieval concepts from the user's question. Do not invent unrelated components.
21. This product is exclusively for elevator/lift engineering. Do NOT require the user to repeat words such as elevator, lift or Aufzug when the technical terms already make the elevator context clear.
22. Treat domain terms such as Kabine/Kabin, Fahrkorb, Schacht, Schachtwand, Schachttür, Schwelle, Schachtgrube, Schachtkopf, Führungsschiene, Gegengewicht, Puffer, car, cabin, shaft, shaft wall, landing door, sill and guide rail as elevator context.
23. A question asking for a minimum, maximum, permissible value, distance, clearance or dimension between elevator components is standards-related unless the user clearly asks only for a project preference. Route such questions as intent = standard even if the user does not write Norm, EN 81, elevator, lift or Aufzug.
24. Do not ask the user to add the word elevator/Aufzug when the component vocabulary is already unambiguous. Ask clarification only for the actually ambiguous technical detail, such as which side or which component interface is meant.

Known knowledge-base example:
Manufacturer: NEW LIFT
Product family: FST
Controller: FST-3
Known FST-3 fault family: LSU

Important mapping:
"LSU" is a faultFamily, NOT a faultCode.

Known LSU mappings:
14 = LSU-ANFAHRPROBLEM
15 = LSU-LAUFZEITUEBERWCH
16 = LSU-GEBERFEHLER
17 = LSU-KABIN. KOMMUNIKTN
18 = LSU-GESCHW. ENDSCHLTR
19 = LSU-ZONE FEHLT
20 = LSU-BREMSE FEHLER
21 = LSU-MOTOR FEHLER
22 = LSU-ZWANGSHALT
23 = LSU-NOTENDSCHALTER

Distinctive symptom signature:
If the user says that pre-control / Vorsteuerung is active but the car/cabin does not start or starts with extremely low speed, this is strong evidence for the known NEW LIFT FST-3 LSU-ANFAHRPROBLEM context, even if the user does not explicitly write "LSU".
Route that symptom combination as:
manufacturer = "NEW LIFT"
productFamily = "FST"
controller = "FST-3"
faultFamily = "LSU"
faultCode = null
faultName = "LSU-ANFAHRPROBLEM"
confidence = "high"
needsClarification = false
searchStrategy = "filtered"
Do NOT apply this mapping if the user explicitly identifies a conflicting manufacturer/controller.

Example:
User: "LSU fault. The elevator does not start moving even though pre-control is active."
Routing:
manufacturer = "NEW LIFT"
productFamily = "FST"
controller = "FST-3"
faultFamily = "LSU"
faultCode = null
faultName = "LSU-ANFAHRPROBLEM"

Example without LSU keyword:
User: "The pre-control is active but the elevator car does not start. What should I check?"
Routing:
manufacturer = "NEW LIFT"
productFamily = "FST"
controller = "FST-3"
faultFamily = "LSU"
faultCode = null
faultName = "LSU-ANFAHRPROBLEM"
confidence = "high"
needsClarification = false
searchStrategy = "filtered"

The faultCode remains null because the user did NOT explicitly provide "14".

Another example:
User: "Fehler 14"
Routing:
faultCode = "14"
manufacturer = null
productFamily = null
controller = null
faultFamily = null
faultName = null
needsClarification = true
searchStrategy = "clarify_first"

Do NOT assume NEW LIFT or FST-3 from the number 14 alone.

Required JSON:
{
  "intent": "troubleshooting" | "documentation" | "standard" | "planning" | "general_technical" | "unknown",
  "questionLanguage": string,
  "preferredSourceLanguage": string,
  "manufacturer": string | null,
  "productFamily": string | null,
  "controller": string | null,
  "faultCode": string | null,
  "faultFamily": string | null,
  "faultName": string | null,
  "topics": string[],
  "components": string[],
  "confidence": "high" | "medium" | "low",
  "needsClarification": boolean,
  "clarificationQuestion": string | null,
  "searchStrategy": "filtered" | "semantic_broad" | "clarify_first"
}

User question:
${question}
`;
}

function parseRouterJson(text: string): any {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Some model responses can still contain code fences or stray text.
  }

  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    // Fall through to extracting the outermost JSON object.
  }

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  throw new Error("Router returned invalid JSON");
}

async function callRouterModel(question: string, apiKey: string) {
  const prompt = buildRouterPrompt(question);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini router error: ${await response.text()}`);
  }

  const data: any = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini router returned no content");
  }

  return text as string;
}

function hasKnownAnfahrproblemSignature(question: string) {
  const normalized = question.toLowerCase();

  const english =
    /pre[-\s]?control/.test(normalized) &&
    /(active|activated|on)/.test(normalized) &&
    /(car|cabin|elevator|lift)/.test(normalized) &&
    /(does\s+not|doesn't|won't|will\s+not|fails?\s+to|not)\s+(start|move|run)/.test(normalized);

  const german =
    /vorsteuer/.test(normalized) &&
    /aktiv/.test(normalized) &&
    /(fahrkorb|kabine|aufzug)/.test(normalized) &&
    /(fährt\s+nicht\s+an|faehrt\s+nicht\s+an|startet\s+nicht|läuft\s+nicht\s+an|laeuft\s+nicht\s+an)/.test(normalized);

  const persian =
    /(پیش[‌\s-]?کنترل|پری[‌\s-]?کنترل|vorsteuerung)/i.test(question) &&
    /فعال/.test(question) &&
    /(کابین|آسانسور)/.test(question) &&
    /(راه\s*نمی|حرکت\s*نمی|شروع\s*نمی)/.test(question);

  return english || german || persian;
}

function applyKnownSymptomMappings(route: any, question: string) {
  if (!hasKnownAnfahrproblemSignature(question)) return;

  const manufacturer = String(route.manufacturer || "").toLowerCase();
  const controller = String(route.controller || "").toLowerCase();

  const conflictingManufacturer =
    manufacturer && !manufacturer.includes("new lift");
  const conflictingController =
    controller && !controller.includes("fst");

  if (conflictingManufacturer || conflictingController) return;

  route.intent = "troubleshooting";
  route.manufacturer = "NEW LIFT";
  route.productFamily = "FST";
  route.controller = "FST-3";
  route.faultFamily = "LSU";
  route.faultName = "LSU-ANFAHRPROBLEM";
  route.confidence = "high";
  route.needsClarification = false;
  route.clarificationQuestion = null;
  route.searchStrategy = "filtered";
}

function normalizeRoute(route: any, question: string): RouterResult {
  if (
    typeof route.faultFamily === "string" &&
    route.faultFamily.startsWith("LSU-")
  ) {
    route.faultName = route.faultName ?? route.faultFamily;
    route.faultFamily = "LSU";
  }

  if (route.faultCode === "LSU") {
    route.faultCode = null;
    route.faultFamily = "LSU";
  }

  if (
    !route.faultFamily &&
    typeof route.faultName === "string" &&
    route.faultName.startsWith("LSU-")
  ) {
    route.faultFamily = "LSU";
  }

  if (
    route.faultCode !== null &&
    route.faultCode !== undefined &&
    !/^\d+$/.test(String(route.faultCode))
  ) {
    route.faultCode = null;
  }

  const explicitFaultCodeMatch = question.match(
    /\b(?:fehler|fault|error|code)?\s*(\d{1,4})\b/i
  );

  if (explicitFaultCodeMatch && !route.faultCode) {
    route.faultCode = explicitFaultCodeMatch[1];
  }

  const genericFaultNumberOnly =
    /^\s*(?:fehler|fault|error|code)?\s*\d{1,4}\s*[?.!]*\s*$/i.test(
      question
    );

  if (genericFaultNumberOnly) {
    route.manufacturer = null;
    route.productFamily = null;
    route.controller = null;
    route.faultFamily = null;
    route.faultName = null;
    route.needsClarification = true;
    route.searchStrategy = "clarify_first";
    route.confidence = "low";
    route.clarificationQuestion =
      route.clarificationQuestion ??
      "Which elevator manufacturer or controller is this fault code from?";
  } else {
    applyKnownSymptomMappings(route, question);
  }

  const questionLanguage =
    route.questionLanguage ??
    (/^[\x00-\x7F]*$/.test(question) ? "en" : null);

  const preferredSourceLanguage =
    route.preferredSourceLanguage ?? questionLanguage;

  return {
    intent: route.intent ?? "unknown",
    questionLanguage,
    preferredSourceLanguage,
    manufacturer: route.manufacturer ?? null,
    productFamily: route.productFamily ?? null,
    controller: route.controller ?? null,
    faultCode: route.faultCode ?? null,
    faultFamily: route.faultFamily ?? null,
    faultName: route.faultName ?? null,
    topics: Array.isArray(route.topics) ? route.topics : [],
    components: Array.isArray(route.components) ? route.components : [],
    confidence: route.confidence ?? "low",
    needsClarification: Boolean(route.needsClarification),
    clarificationQuestion: route.clarificationQuestion ?? null,
    searchStrategy: route.searchStrategy ?? "semantic_broad",
  };
}

function deterministicStandardsRoute(question: string): RouterResult | null {
  const explicitStandard =
    /\bEN\s*81\s*[-–]?\s*\d+\b/i.test(question) ||
    /\b(DIN\s*)?(norm|normen|standard|standards)\b/i.test(question) ||
    /(استاندارد|نورم|نُرم)/i.test(question);

  // elevator.help is an elevator-only product. Users should be able to ask
  // "Abstand zwischen Kabine und Schachtwand?" without repeating "Aufzug".
  const elevatorDomain =
    /(aufzug|fahrkorb|kabin(?:e|en)?|kabin\b|schacht(?:wand|tür|grube|kopf)?|schwelle|führungsschiene|gegengewicht|puffer|landing\s+door|shaft(?:\s+wall)?|car\s+sill|cabin|guide\s+rail|counterweight)/i.test(question) ||
    /(آسانسور|کابین|چاه(?:\s*آسانسور)?|دیواره\s*چاه|ریل|وزنه\s*تعادل)/i.test(question);

  const asksNormativeDimension =
    /(\bmin(?:imum)?\.?\b|\bmax(?:imum)?\.?\b|mindest|höchst|maximal|zulässig|abstand|clearance|distance|dimension|maß|mas+|فاصله|حداقل|حداکثر)/i.test(question);

  const isStandard = explicitStandard || (elevatorDomain && asksNormativeDimension);
  if (!isStandard) return null;

  const questionLanguage = /[؀-ۿ]/.test(question)
    ? "fa"
    : /\b(wer|was|warum|wie|wieviel|wie\s+viel|min|max|abstand|aufzug|fahrkorb|kabin|schacht|schwelle|norm|normen)\b/i.test(question)
      ? "de"
      : "en";

  return {
    intent: "standard",
    questionLanguage,
    preferredSourceLanguage: questionLanguage,
    manufacturer: null,
    productFamily: null,
    controller: null,
    faultCode: null,
    faultFamily: null,
    faultName: null,
    topics: asksNormativeDimension ? ["clearance", "dimensions"] : [],
    components: [],
    confidence: "high",
    needsClarification: false,
    clarificationQuestion: null,
    searchStrategy: "semantic_broad",
  };
}

export async function routeQuestion(question: string): Promise<RouterResult> {
  const deterministicStandard = deterministicStandardsRoute(question);
  if (deterministicStandard) return deterministicStandard;

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  let lastError: unknown;

  // Retry once if Gemini ever emits malformed structured output.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const text = await callRouterModel(question, apiKey);
      const route = parseRouterJson(text);
      return normalizeRoute(route, question);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Router failed");
}