// Deterministic, filename-independent document identity hints. Uncertain metadata stays unknown.
const LANGUAGE_MARKERS = {
  de: /\b(?:Prüfung|Prüfmuster|Aufzug|Anforderungen|Sicherheit|müssen|Schacht|Türen|Einbau|Betrieb)\b/giu,
  en: /\b(?:requirements|safety|shall|testing|specimen|installation|lift|elevator|doors|operation)\b/giu,
  it: /\b(?:requisiti|sicurezza|ascensore|prova|installazione|deve|porte|funzionamento)\b/giu,
  fr: /\b(?:exigences|sécurité|ascenseur|essai|installation|doit|portes|fonctionnement)\b/giu,
  es: /\b(?:requisitos|seguridad|ascensor|ensayo|instalación|debe|puertas|funcionamiento)\b/giu,
  nl: /\b(?:vereisten|veiligheid|lift|beproeving|installatie|moet|deuren|werking)\b/giu,
};
export function detectDocumentLanguage(text, fileName = '') {
  const sample = String(text || '').slice(0, 16000);
  const scores = Object.entries(LANGUAGE_MARKERS).map(([lang, pattern]) => [lang, (sample.match(pattern) || []).length]);
  scores.sort((a,b) => b[1] - a[1]);
  if (scores[0]?.[1] >= 3 && scores[0][1] >= (scores[1]?.[1] || 0) * 1.5) return scores[0][0];
  // Language suffix is only a weak hint, and EN in EN 81-20 means European Norm.
  const suffix = String(fileName).replace(/\.[^.]+$/, '').match(/(?:[_\-. ])(DE|EN|IT|FR|ES|NL)$/i);
  return suffix ? suffix[1].toLowerCase() : null;
}
export function resolveDocumentIdentity({fileId, fileName = '', text = '', sourcePath = ''}) {
  const sample = `${String(text).slice(0,12000)}\n${fileName.replaceAll('_',' ')}`;
  const standard = sample.match(/\b(?:DIN\s+|SN\s+|BS\s+|UNI\s+)?(?:EN\s+ISO|ISO|EN|VDI)\s*[-_ ]?\s*(\d{2,5}(?:\s*[-_]\s*\d{1,5}){1,3})\b/i);
  const standardId = standard ? standard[0].replace(/^(?:DIN|SN|BS|UNI)\s+/i,'').replace(/[_\s]+/g,'-').replace(/-+/g,'-').toUpperCase() : null;
  const edition = sample.match(/\b(?:19|20)\d{2}\b/g);
  const year = edition?.length === 1 ? Number(edition[0]) : null;
  const language = detectDocumentLanguage(text, fileName);
  const extension = fileName.split('.').pop()?.toLowerCase();
  const documentType = /^(xlsm|xlsx|xls|ods)$/.test(extension || '') ? 'calculation' :
    /(?:catalog|catalogue|katalog)/i.test(fileName) ? 'catalog' :
    /(?:error|fault|fehler|errore)/i.test(fileName) ? 'fault-catalog' :
    standardId && /(?:norm|standard|\bEN\b|\bISO\b)/i.test(sample.slice(0,500)) ? 'standard-candidate' : 'unknown';
  return {fileId, standardId, editionYear: year, language, documentType, sourcePath, confidence: standardId ? 'candidate' : 'unknown'};
}
export function needsMetadataRefresh(previous, file, identity) {
  return Boolean(previous && (previous.name !== file.name || previous.sourcePath !== file.sourcePath ||
    previous.documentIdentity?.language !== identity.language ||
    previous.documentIdentity?.standardId !== identity.standardId ||
    previous.documentIdentity?.editionYear !== identity.editionYear));
}
