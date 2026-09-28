export type ConversationHistoryItem = {
  role?: string;
  content?: string;
  text?: string;
  mode?: string;
};

const FAULT_CODE_PREFIX =
  /(?:fehler(?:code)?|fault(?:\s*code)?|error(?:\s*code)?|code|کد(?:\s*خطا)?|خطای?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._-]{0,15})/i;

function itemText(item: ConversationHistoryItem | undefined) {
  return typeof item?.content === "string"
    ? item.content.trim()
    : typeof item?.text === "string"
      ? item.text.trim()
      : "";
}

export function extractFaultCode(value: string, allowStandalone = false) {
  const explicit = value.match(FAULT_CODE_PREFIX)?.[1];
  const standalone = allowStandalone
    ? (value.match(/\b(?=[A-Z0-9._-]{3,16}\b)(?=[A-Z0-9._-]*\d)[A-Z0-9][A-Z0-9._-]*\b/gi) || [])
        .sort((left, right) => {
          const digitDelta = (right.match(/\d/g)?.length || 0) - (left.match(/\d/g)?.length || 0);
          return digitDelta || right.length - left.length;
        })[0]
    : undefined;
  const candidate = (explicit || standalone)
    ?.replace(/[._-]+$/g, "")
    .toUpperCase();

  if (!candidate || !/\d/.test(candidate)) return null;
  return candidate;
}

export function canonicalManufacturer(value: string) {
  const compact = value.replace(/[‌\s_-]+/g, " ").trim();

  if (/\bnew\s*lift\b/i.test(compact) || /نیو\s*(?:لیفت|ایفت)/i.test(compact)) {
    return "NEW LIFT";
  }
  if (/\bschindler\b/i.test(compact) || /شیندلر/i.test(compact)) return "Schindler";
  if (/\bkone\b/i.test(compact) || /کونه/i.test(compact)) return "KONE";
  if (/\botis\b/i.test(compact) || /اوتیس/i.test(compact)) return "OTIS";
  if (/\b(?:tk\s*elevator|tke|thyssenkrupp)\b/i.test(compact) || /تایسن|تی\s*کی/i.test(compact)) {
    return "TK Elevator";
  }
  if (/\bziehl[-\s]*abegg\b/i.test(compact) || /زیل(?:ابگ|\s*آبگ)/i.test(compact)) {
    return "Ziehl-Abegg";
  }
  if (/\bweber\b/i.test(compact) || /وبر/i.test(compact)) return "Weber";
  return null;
}

export function isBareFaultCodeQuestion(value: string) {
  const code = extractFaultCode(value);
  if (!code) return false;

  const remainder = value
    .replace(FAULT_CODE_PREFIX, " ")
    .replace(
      /\b(?:what|does|do|is|the|mean|meaning|was|bedeutet|ist|bedeutung|bitte|please|tell|me)\b/gi,
      " "
    )
    .replace(/(?:یعنی|معنی|چیست|چیه|لطفاً|لطفا|بگو|میشه|می‌شود)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();

  return remainder.length === 0;
}

export function manufacturerClarificationQuestion(question: string) {
  const language = /[؀-ۿ]/.test(question)
    ? "fa"
    : /\b(what|which|from|manufacturer|controller|mean|does)\b/i.test(question)
      ? "en"
      : "de";

  if (language === "fa") {
    return "برای بررسی دقیق‌تر، سازنده یا نوع تابلو فرمان (مثلاً Newlift، Weber، Sigma و ...) را می‌فرمایید؟";
  }
  if (language === "de") {
    return "Um Ihnen weiterhelfen zu können: Können Sie angeben, von welchem Hersteller oder Steuerungstyp (z. B. Newlift, Weber, Sigma ....) die Meldung stammt?";
  }
  return "To help further, which elevator manufacturer or controller type (e.g. Newlift, Weber, Sigma ....) produced this message?";
}

export function resolveManufacturerClarification(
  reply: string,
  history: ConversationHistoryItem[]
) {
  const last = history[history.length - 1];
  const prior = history[history.length - 2];
  const assistant = itemText(last);
  const user = itemText(prior);
  const isClarification = last?.mode === "clarification" || /(hersteller|manufacturer|steuerungstyp|controller|سازنده|برند|تابلو\s*فرمان|مدل)/i.test(assistant);

  if (
    last?.role !== "assistant" ||
    prior?.role !== "user" ||
    !isClarification ||
    !extractFaultCode(user) ||
    reply.length > 80
  ) {
    return null;
  }

  const manufacturer = canonicalManufacturer(reply);
  return manufacturer ? `${user} Hersteller: ${manufacturer}.` : null;
}

export function historyEvidenceLabel(mode: string | undefined) {
  if (
    mode === "internal_evidence" ||
    mode === "standards_verified" ||
    mode === "planning_with_verified_standards" ||
    mode === "standards_knowledge_base"
  ) {
    return "verified from internal source excerpts";
  }
  if (mode === "gemini_web" || mode === "standards_web_fallback") {
    return "answered with public-web grounding";
  }
  if (mode === "gemini_direct" || mode === "gemini_direct_unverified") {
    return "answered by Gemini without verified internal or web evidence";
  }
  return null;
}

export function asksResponseProvenance(value: string) {
  return (
    /\b(?:source|provenance|where\s+did\s+(?:that|this|the\s+answer)\s+come\s+from|web\s+or\s+internal)\b/i.test(value) ||
    /\b(?:quelle|woher\s+(?:kommt|kam)\s+(?:die|deine)\s+antwort|internet\s+oder\s+intern)\b/i.test(value) ||
    /(?:از\s*(?:وب|اینترنت|مدارک\s*داخلی)|وب\s*(?:جواب|پاسخ)|مدارک\s*داخلی|منبع(?:ت|ش|ها)?\s*کجاست|جواب.*(?:وب|مدارک))/i.test(value)
  );
}
