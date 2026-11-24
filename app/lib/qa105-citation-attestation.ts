/** QA fixture attestation only; never changes the production retrieval ranking. */
type Hit = {source_file_id:string;page:number;text:string};
export function qa105CitationFailure(
 hits:readonly Hit[],source:string,page:number,code:string,clause:string,
):string|null {
 if(!hits.length)return "QA105_EVIDENCE_EMPTY";
 const sourceHits=hits.filter(h=>h.source_file_id===source);
 if(!sourceHits.length)return "QA105_EVIDENCE_WRONG_SOURCE";
 const pageHits=sourceHits.filter(h=>h.page===page);
 if(!pageHits.length)return "QA105_EVIDENCE_WRONG_PAGE";
 const codeHits=pageHits.filter(h=>String(h.text||"").includes(code));
 if(!codeHits.length)return "QA105_EVIDENCE_CODE_TEXT_MISMATCH";
 if(!codeHits.some(h=>String(h.text||"").includes(clause)))
   return "QA105_EVIDENCE_CLAUSE_TEXT_MISMATCH";
 // A single chunk must contain BOTH terms on the exact expected page.
 // Other legitimate search results cannot become the attested citation.
 return null;
}
