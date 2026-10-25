// Release QA accepts only a physical PDF page label, not a printed standard page.
// This is a presentation check, not a substitute for source fingerprint verification.
const physicalPage=/(?<![\p{L}\p{N}])(?:PDF[\s-]+(?:Seite|page)|página\s+PDF|صفحهٔ?\s*PDF)\s+([1-9]\d*)(?![\d.\p{L}])/iu;
export function hasPhysicalPdfPageCitation(answer){
  return typeof answer==='string' && physicalPage.test(answer);
}

// A release expectation must identify an edition, a clause and the physical page
// together. Otherwise a generic page mention can make unrelated evidence pass QA.
export function hasEn8120ReleaseCitationContract(citation){
  if(typeof citation!=='string' || /[\r\n]/u.test(citation)) return false;
  const edition=/\b(?:DIN\s+)?EN\s*81[\s-]*20\s*[:\-]\s*(?:19|20)\d{2}(?:-\d{2})?\b/iu.exec(citation);
  const clause=/\b\d+(?:\.\d+){2,}\b/u.exec(citation);
  const page=physicalPage.exec(citation);
  if(!edition || !clause || !page || edition.index!==citation.search(/\S/u)
      || edition.index+edition[0].length>=clause.index
      || clause.index+clause[0].length>=page.index) return false;
  // Keep the expected release citation as one contiguous source/edition/clause/PDF-page label.
  // Scattered metadata and unrelated sentences must never satisfy the signed-in QA gate.
  const separator=/^[\s,;:(){}\[\]\u00a7\u060c\u2013\u2014-]*$/u;
  return separator.test(citation.slice(edition.index+edition[0].length,clause.index))
    && separator.test(citation.slice(clause.index+clause[0].length,page.index))
    && separator.test(citation.slice(page.index+page[0].length));
}
