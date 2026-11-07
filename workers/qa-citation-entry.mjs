// Independent QA-only application: signed-in citation smoke, never Production.
// No ingestion routes, public chat, or other application surfaces are reachable.
import app from "../.open-next/worker.js";
import {verifyToken} from "@clerk/backend";
import {QA_CITATION_HTML,QA_CITATION_PATH} from "./qa-citation-browser-page.mjs";

const QUESTION="Was fordert DIN EN 81-20:2014 Abschnitt 5.4.7.4 zur Umwehrung auf dem Fahrkorbdach?";
function safeQaEnvironment(env){
  return env?.AUTH_REQUIRED==="true"&&env?.DAILY_QUESTION_LIMIT_ENABLED==="false"&&
    env?.CORTEX_LEARNING_ENABLED==="false"&&env?.MULTILINGUAL_RETRIEVAL_ENABLED==="true"&&
    env?.GEMINI_MAX_CALLS_PER_QUESTION==="2"&&
    typeof env?.CLERK_SECRET_KEY==="string"&&env.CLERK_SECRET_KEY.startsWith("sk_test_")&&
    /^user_[A-Za-z0-9]{8,64}$/.test(env?.CLERK_QA_TEST_USER_ID||"")&&
    typeof env?.GEMINI_API_KEY==="string"&&env.GEMINI_API_KEY.length>0&&
    env?.CORTEX_DB&&env?.VECTORIZE&&env?.VECTORIZE_V2&&env?.AI;
}
export async function citationQaFetch(request,env,ctx,forward=app,verifyJwt=verifyToken){
  const u=new URL(request.url);
  if(u.pathname===QA_CITATION_PATH&&request.method==="GET")
    return new Response(QA_CITATION_HTML,{status:200,headers:{
      "content-type":"text/html; charset=utf-8","cache-control":"no-store",
      "x-frame-options":"DENY","referrer-policy":"no-referrer",
      "x-content-type-options":"nosniff",
      "content-security-policy":"default-src 'none'; script-src 'unsafe-inline' https://*.accounts.dev; connect-src 'self' https://*.accounts.dev https://*.clerk.accounts.dev; style-src 'unsafe-inline'; frame-src https://*.accounts.dev; img-src https: data:; font-src https:; form-action https://*.accounts.dev"
    }});
  if(u.pathname==="/api/health/gemini"&&request.method==="GET")
    return safeQaEnvironment(env)?forward.fetch(request,env,ctx):new Response("Unavailable",{status:503});
  if(u.pathname!=="/api/ask"||request.method!=="POST")
    return new Response("Not Found",{status:404});
  if(!safeQaEnvironment(env))return new Response("QA config unavailable",{status:503});
  if(Number(request.headers.get("content-length")||0)>600)
    return new Response("QA request too large",{status:413});
  let body;
  try{
    const raw=await request.clone().text();
    if(raw.length>600)return new Response("QA request too large",{status:413});
    body=JSON.parse(raw);
  }catch{return new Response("Invalid QA request",{status:400});}
  if(!body||typeof body!=="object"||Array.isArray(body)||
     Object.keys(body).length!==1||body.question!==QUESTION)
    return new Response("Only one approved QA question is allowed",{status:403,headers:{"x-qa-citation-gate":"QUESTION_NOT_APPROVED"}});
  // The real app re-verifies this JWT independently. The wrapper additionally
  // restricts access to ONE owner-approved Clerk test user.
  const header=request.headers.get("authorization")||"";
  const token=header.startsWith("Bearer ")?header.slice(7).trim():"";
  if(!token||token.length>8000)return new Response("Please sign in",{status:401});
  let claims;
  try{
    const verified=await verifyJwt(token,{
      secretKey:env.CLERK_SECRET_KEY,authorizedParties:[u.origin]
    });
    if(verified?.errors!=null)return new Response("Invalid session",{status:401});
    claims=verified?.data;
  }catch{return new Response("Invalid session",{status:401});}
  if(claims?.sub!==env.CLERK_QA_TEST_USER_ID||
     typeof claims.sid!=="string"||!claims.sid.startsWith("sess_"))
    return new Response("Not authorized for QA",{status:403,headers:{"x-qa-citation-gate":"TEST_USER_MISMATCH"}});
  const answer=await forward.fetch(request,env,ctx);
  if(answer.status!==403)return answer;
  // Never leak response bodies, identity, or any token to a browser diagnostic.
  const headers=new Headers(answer.headers);
  headers.set("x-qa-citation-gate","APP_FORBIDDEN");
  headers.set("cache-control","no-store");
  return new Response(answer.body,{status:answer.status,statusText:answer.statusText,headers});
}
export default {fetch:citationQaFetch};
