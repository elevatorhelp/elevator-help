import {getCloudflareContext} from "@opennextjs/cloudflare";
import {NextRequest,NextResponse} from "next/server";
import {searchArchiveEvidenceIndex} from "../../lib/archive-evidence-index";
import {extractReferenceIdentifiers} from "../../lib/reference-identifiers";
export async function POST(request:NextRequest){
 const {env}=getCloudflareContext();
 if((env as any).QA_EXACT_EVIDENCE_LOOKUP!=="true")
   return NextResponse.json({ok:false,error:"DISABLED"},{status:404});
 const token=(env as any).QA_INGESTION_TOKEN;
 if(!token||request.headers.get("authorization")!=="Bearer "+token)
   return NextResponse.json({ok:false,error:"UNAUTHORIZED"},{status:401});
 try{
  const body=await request.json() as {query?:string};
  if(typeof body.query!=="string"||body.query.length<3||body.query.length>500)
    return NextResponse.json({ok:false,error:"INVALID_QUERY"},{status:400});
  const identifiers=extractReferenceIdentifiers(body.query);
  if(!identifiers.length)return NextResponse.json({ok:true,results:[]});
  const rows=await searchArchiveEvidenceIndex((env as any).CORTEX_DB,identifiers,[],10);
  return NextResponse.json({ok:true,results:rows.map(row=>({
   text:row.text,sourceFileId:row.source_file_id,fileName:row.file_name,
   page:row.page,chunkId:row.id,matchedIdentifiers:row.matched_identifiers
  }))});
 }catch{
  return NextResponse.json({ok:false,error:"QA_EVIDENCE_RETRIEVAL_FAILED"},{status:503});
 }
}
