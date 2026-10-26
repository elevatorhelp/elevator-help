/** Visibility rule for immutable generation-staged Vectorize records.
 * A staged match is NEVER visible unless D1 explicitly publishes its generation.
 * Legacy IDs remain readable only when no staged generation is published.
 */
export type Publication={active_generation:number};
export function parseStagedId(id:string):{generation:number;originalId:string}|null{
 const match=/^g([1-9][0-9]*):(.+)$/.exec(id);
 if(!match)return null;
 const generation=Number(match[1]);
 if(!Number.isSafeInteger(generation))return null;
 return {generation,originalId:match[2]};
}
export async function filterPublishedMatches<T extends {id:string;metadata?:Record<string,unknown>}>(
 db:any,matches:T[],strict=false,
):Promise<T[]>{
 const visible:T[]=[];
 // A Vectorize response may contain many chunks from one document. Resolve
 // its D1 publication once per invocation; reuse failures too (fail closed).
 const publications=new Map<string,Promise<Publication|null>>();
 for(const match of matches){
  const id=String(match.id||"");
  const stage=parseStagedId(id);
  // Reject malformed staged IDs before any legacy compatibility fallback.
  if(!stage && /^g[0-9]+:/.test(id))continue;
  const documentId=match.metadata?.sourceFileId;
  if(!stage && strict)continue;
  // Only a deliberately absent D1 binding permits legacy-only retrieval.
  // An unusable configured binding or missing source identity cannot prove
  // that a legacy vector was not superseded; fail closed in those cases.
  if(!stage && !strict && db == null){
    visible.push(match);
    continue;
  }
  if(typeof documentId!=="string"||!documentId||!db?.prepare)continue;
  try{
   let pending=publications.get(documentId);
   if(!pending){
    pending=Promise.resolve().then(()=>db.prepare("SELECT active_generation FROM ingestion_document_publications WHERE document_id=?").bind(documentId).first() as Promise<Publication|null>);
    publications.set(documentId,pending);
   }
   const publication=await pending;
   if(stage){
     if(publication?.active_generation===stage.generation)visible.push(match);
   } else if(!publication || !publication.active_generation)visible.push(match);
  }catch(error){
   // A schema that predates staged publication may safely serve legacy IDs.
   // Transient D1 errors must NOT resurrect legacy IDs superseded by an
   // active generation: fail closed unless the publication table is absent.
   if(!stage&&!strict &&
      /no such table:\s*(?:main\.)?ingestion_document_publications\b/i.test(String(error)))
     visible.push(match);
  }
 }
 return visible;
}
