const WEB_SOURCE_LABELS: Record<string, string> = {
  de: "Quelle: Web-Recherche",
  en: "Source: Web research",
  es: "Fuente: búsqueda web",
  fa: "منبع: جست‌وجوی وب",
};

export function webSourceLabel(language?: string | null) {
  const primary = String(language || "en")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return WEB_SOURCE_LABELS[primary] || WEB_SOURCE_LABELS.en;
}

export function addWebSourceLabel(
  answer: string,
  language?: string | null,
) {
  const clean = answer
    .trim()
    .replace(
      /\s*(?:Web-based|Quelle:\s*Web-Recherche|Source:\s*Web research|Fuente:\s*búsqueda web|منبع:\s*جست‌وجوی وب)\s*$/iu,
      "",
    )
    .trim();
  return `${clean}\n\n${webSourceLabel(language)}`;
}
