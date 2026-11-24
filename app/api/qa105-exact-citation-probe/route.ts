/**
 * Issue #105 fail-closed REAL QA authentication/Citation boundary.
 * This endpoint is deliberately NOT /api/ask and never generates answers.
 * QA-only, explicit feature gate, exact D1 and twin Vectorize bindings.
 * Never expose page text, source paths, tokens, Clerk claims or model outputs.
 */
import {NextRequest,NextResponse} from "next/server";
import {getCloudflareContext} from "@opennextjs/cloudflare";
import {authorizeChatRequest} from "../../lib/request-auth";
import {verifyToken} from "@clerk/backend";
import {searchPublishedImmutableEvidence} from "../../lib/ingestion-v2-evidence-references";
import {referenceIdentifierKey} from "../../lib/reference-identifiers";
import {extractClauseNumbers} from "../../lib/standard-identifiers";
import {QA106_A_PDF_ID} from "../../lib/qa106-b-exact-map-repair";

const authorizedQAUser=process.env.QA105_EXPECTED_CLERK_TEST_USER_ID;
const denial=(code:string,status:number)=>NextResponse.json(
 {ok:false,code},{status,headers:{"Cache-Control":"no-store"}});
const cases:Record<string,{code:string;clause:string;page:number;language:string}>={
 de:{code:"QA-4711",clause:"QA-1.2.3",page:1,language:"de"},
 it:{code:"MOCK-DOOR-12",clause:"QA-2.4.6",page:2,language:"it"},
};
export async function POST(request:NextRequest){
 // Do not use auth opt-out; the regular QA Wrangler config intentionally
 // has AUTH_REQUIRED=false. This dedicated probe is unusable until a
 // dedicated isolated Clerk test configuration explicitly opts in.
 if(process.env.QA105_AUTH_CITATION_PROBE_ENABLED!=="true"||
    process.env.AUTH_REQUIRED!=="true"||
    !/^user_[A-Za-z0-9]{8,100}$/.test(authorizedQAUser||"")||
    !process.env.CLERK_SECRET_KEY||
    process.env.GEMINI_API_KEY||process.env.GEMINI_BENCHMARK_API_KEY)
   return denial("QA105_PROBE_DISABLED",503);
 let env:Record<string,unknown>;
 try{env=getCloudflareContext().env as Record<string,unknown>}
 catch{return denial("QA105_BINDINGS_UNAVAILABLE",503)}
 const d1=(env as any)?.CORTEX_DB;
 const a=(env as any)?.VECTORIZE,b=(env as any)?.VECTORIZE_V2;
 if(env.QA106_ISOLATED_BINDINGS!=="qa106-pr100-v2-only"||
    env.QA105_AUTH_CITATION_PROBE_ENABLED!=="true"||
    env.INGESTION_PUBLISHED_READS_ENABLED!=="true"||
    env.INGESTION_MAP_REVISION_READS_ENABLED!=="true"||
    typeof d1?.prepare!=="function"||
    typeof a?.getByIds!=="function"||
    typeof b?.getByIds!=="function")
   return denial("QA105_PROBE_BINDINGS_DENIED",503);
 // Wrangler remote preview rewrites request.url to its internal host.
 // Only the explicitly enabled isolated TEST probe may use the fixed
 // external loopback party. Never derive this from forwarded headers.
 const testOriginMode=env.QA105_AUTH_ORIGIN_DIAG==="true";
 if(testOriginMode&&!/^sk_test_/.test(process.env.CLERK_SECRET_KEY||""))
   return denial("QA105_TEST_KEY_REQUIRED",503);
 const auth=await authorizeChatRequest(request,testOriginMode?
   async(token,options)=>{
     const verified=await verifyToken(token,{
       ...options,authorizedParties:["http://127.0.0.1:8797"],
     });
     const raw=verified as unknown as Record<string,unknown>;
     const claims=("data" in raw?raw.data:raw) as Record<string,unknown>|null;
     if(!claims||claims.azp!=="http://127.0.0.1:8797")
       throw Error("QA105_TEST_ORIGIN_CLAIM_REQUIRED");
     return verified;
   }:verifyToken);
 if(!auth.ok){
   // Diagnostics are restricted to the dedicated TEST-only positive
   // workflow. Return only fixed enums (never a URL, key, JWT or claims).
   if(env.QA105_AUTH_ORIGIN_DIAG==="true"&&auth.status===401){
     const bearer=request.headers.get("authorization")||"";
     const jwt=bearer.startsWith("Bearer ")?bearer.slice(7):"";
     let signed=false;
     if(jwt.length>90&&jwt.length<10000){
       try{
         const raw=await verifyToken(jwt,{secretKey:process.env.CLERK_SECRET_KEY});
         if(raw&&typeof raw==="object"&&
           (!("errors" in raw)||raw.errors==null)){
           const claims="data" in raw?raw.data:raw;
           signed=!!claims&&typeof claims==="object"&&
             (claims as any).sub===authorizedQAUser&&
             typeof (claims as any).sid==="string";
         }
       }catch{/* Return only a fixed failure enum. */}
     }
     // Preserve the public negative-auth contract for unsigned or forged
     // requests. Only a verified dedicated TEST identity gets diagnostics.
     if(!signed)return denial("QA105_AUTH_DENIED",401);
     if(new URL(request.url).origin!=="http://127.0.0.1:8797")
       return denial("QA105_WORKER_ORIGIN_NOT_EXPECTED",401);
     return denial("QA105_WORKER_ORIGIN_CLAIM_MISMATCH",401);
   }
   return denial("QA105_AUTH_DENIED",auth.status);
 }
 if(auth.userId!==authorizedQAUser)return denial("QA105_WRONG_TEST_IDENTITY",403);
 let body:unknown;
 try{body=await request.json()}catch{return denial("QA105_BAD_REQUEST",400)}
 if(!body||typeof body!=="object"||
    !Object.prototype.hasOwnProperty.call(cases,(body as any).language))
   return denial("QA105_BAD_REQUEST",400);
 const language=(body as any).language as string;
 const expected=cases[language];
 // Fixed Issue #105 source is original published A, NOT the unrelated B
 // Map revision fixture. No arbitrary document ID, text or term lookups.
 // Use exact production identifier normalization (not the display labels).
 const refKey=referenceIdentifierKey(expected.code);
 const clause=extractClauseNumbers(expected.clause)[0];
 if(!refKey||!clause)return denial("QA105_INVALID_NORMALIZATION",503);
 try{
   const hits=await searchPublishedImmutableEvidence(
     d1,[{key:refKey,label:expected.code,structured:true}],
     [clause],10);
   if(hits.length!==1||hits[0]?.source_file_id!==QA106_A_PDF_ID||
      hits[0]?.page!==expected.page||
      !String(hits[0]?.text||"").includes(expected.code)||
      !String(hits[0]?.text||"").includes(expected.clause))
     return denial("QA105_EXACT_SOURCE_NOT_ATTESTED",409);
   return NextResponse.json({
    ok:true,qaOnly:true,modelCalls:0,
    language,referenceCode:expected.code,
    section:expected.clause,page:expected.page,
    sourceAttested:true,
   },{headers:{"Cache-Control":"no-store"}});
 }catch{return denial("QA105_SOURCE_UNAVAILABLE",503)}
}
