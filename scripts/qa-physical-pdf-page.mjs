// Release QA accepts only a physical PDF page label, not a printed standard page.
// This is a presentation check, not a substitute for source fingerprint verification.
const physicalPage=/(?:PDF[\s-]+(?:Seite|page)|página\s+PDF|صفحهٔ?\s*PDF)\s+([1-9]\d*)(?![\d.\p{L}])/iu;
export function hasPhysicalPdfPageCitation(answer){
  return typeof answer==='string' && physicalPage.test(answer);
}
