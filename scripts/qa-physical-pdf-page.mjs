// Release QA accepts only a physical PDF page label, not a printed standard page.
// This is a presentation check, not a substitute for source fingerprint verification.
const physicalPage=/(?<![\p{L}\p{N}])(?:PDF[\s-]+(?:Seite|page)|página\s+PDF|صفحهٔ?\s*PDF)\s+([1-9]\d*)(?![\d.\p{L}])/iu;
export function hasPhysicalPdfPageCitation(answer){
  return typeof answer==='string' && physicalPage.test(answer);
}

// A release expectation must identify an edition, a clause and the physical page
// together. Otherwise a generic page mention can make unrelated evidence pass QA.
export function hasEn8120ReleaseCitationContract(citation){
  return typeof citation==='string'
    && /\b(?:DIN\s+)?EN\s*81[\s-]*20\s*[:\-]\s*(?:19|20)\d{2}(?:-\d{2})?\b/iu.test(citation)
    && /\b\d+(?:\.\d+){2,}\b/u.test(citation)
    && hasPhysicalPdfPageCitation(citation);
}
