/** Visibility rule for immutable generation-staged Vectorize records.
 * A staged match is NEVER visible unless D1 explicitly publishes its generation.
 * Legacy IDs remain readable until a separate, verified cutover.
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
 for(const match of matches){
  const stage=parseStagedId(String(match.id||""));
  if(!stage){if(!strict)visible.push(match);continue;}
  const documentId=match.metadata?.sourceFileId;
  if(typeof documentId!=="string"||!documentId||!db?.prepare)continue;
  try{
   const publication=await db.prepare("SELECT active_generation FROM ingestion_document_publications WHERE document_id=?").bind(documentId).first() as Publication|null;
   if(publication?.active_generation===stage.generation)visible.push(match);
  }catch{ /* fail closed for staged matches */ }
 }
 return visible;
}
