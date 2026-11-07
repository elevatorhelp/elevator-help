// A separate auth-only QA Worker, never the existing ingestion QA Worker.
// No D1, Vectorize, AI or Gemini bindings. No nonempty question is accepted.
import app from "../.open-next/worker.js";
import {verifyToken} from "@clerk/backend";
import {QA_CLERK_BROWSER_HTML,QA_CLERK_BROWSER_PATH} from "./qa-clerk-browser-page.mjs";

// QA-only diagnostics: never reveal the token, user ID, azp, claims or SDK messages.
const QA_ERROR_REASONS=new Set([
 "token-invalid-authorized-parties","token-invalid-signature","token-invalid-issuer",
 "token-expired","token-not-active-yet","token-iat-in-the-future",
 "token-invalid","jwk-failed-to-load","jwk-failed-to-resolve",
 "jwk-kid-mismatch","remote-jwk-failed-to-load"
]);
function safeReason(error){
 const reason=error?.reason;
 return typeof reason==="string"&&QA_ERROR_REASONS.has(reason)
   ?reason.toUpperCase().replaceAll("-","_"):"UNCLASSIFIED";
}
async function qaVerifyClassification(token,origin,secretKey,verifyJwt){
 let result;
 try{result=await verifyJwt(token,{secretKey,authorizedParties:[origin]});}
 catch(error){return "SDK_"+safeReason(error);}
 if(result?.errors!=null)
   return Array.isArray(result.errors)&&result.errors.length
     ?"SDK_"+safeReason(result.errors[0]):"SDK_ERRORS_PRESENT";
 const claims=result&&typeof result==="object"
   ?("data" in result?result.data:result):null;
 if(!claims||typeof claims!=="object"||Array.isArray(claims))
   return "NO_VERIFIED_CLAIMS";
 if(typeof claims.sub!=="string"||!claims.sub.startsWith("user_"))
   return "INVALID_VERIFIED_SUB";
 if(typeof claims.sid!=="string"||!claims.sid.startsWith("sess_"))
   return "INVALID_VERIFIED_SID";
 return "SDK_VERIFIED_APP_REJECTED";
}
export async function clerkQaFetch(request,env,ctx,handler=app,verifyJwt=verifyToken){
  const url=new URL(request.url);
  if(url.pathname===QA_CLERK_BROWSER_PATH&&request.method==="GET")
    return new Response(QA_CLERK_BROWSER_HTML,{status:200,headers:{
      "content-type":"text/html; charset=utf-8",
      "cache-control":"no-store",
      "referrer-policy":"no-referrer",
      "x-content-type-options":"nosniff",
      "x-frame-options":"DENY",
      "permissions-policy":"camera=(), microphone=(), geolocation=()",
    }});
  if(url.pathname!=="/api/ask"||request.method!=="POST")
    return new Response("Not Found",{status:404});
  if(env.AUTH_REQUIRED!=="true"||env.QA_CLERK_AUTH_ONLY!=="true"||
     typeof env.CLERK_SECRET_KEY!=="string"||
     !env.CLERK_SECRET_KEY.startsWith("sk_test_")||
     env.GEMINI_API_KEY||env.AI||
     env.CORTEX_DB||env.VECTORIZE||env.VECTORIZE_V2)
    return new Response("QA configuration unavailable",{status:503});
  // Even if a real Clerk JWT is presented, this deployment has no paid/DB
  // answer capability. Only an empty question may reach real Clerk auth.
  if(Number(request.headers.get("content-length")||0)>128)
    return new Response("QA probe too large",{status:413});
  let body;
  try{
    const raw=await request.clone().text();
    if(raw.length>128)return new Response("QA probe too large",{status:413});
    body=JSON.parse(raw);
  }catch{return new Response("Invalid QA request",{status:400});}
  if(!body||typeof body!=="object"||Array.isArray(body)||
    Object.keys(body).some(k=>k!=="question")||
    body.question!=="")
    return new Response("Nonempty questions disabled for Clerk QA",{status:403});
  const response=await handler.fetch(request,env,ctx);
  // Only classify the *failed* authenticated QA test, never an unsigned
  // request. Do not alter the response status or any production source.
  if(response.status!==401)return response;
  const auth=request.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return response;
  const token=auth.slice(7).trim();
  if(token.length<40||token.length>8000||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
   return response;
  const code=await qaVerifyClassification(token,url.origin,env.CLERK_SECRET_KEY,verifyJwt);
  const headers=new Headers(response.headers);
  headers.set("x-qa-clerk-verify",code);
  headers.set("cache-control","no-store");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});

}
export default {fetch:clerkQaFetch};
