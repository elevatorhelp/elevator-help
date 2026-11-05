// A separate auth-only QA Worker, never the existing ingestion QA Worker.
// No D1, Vectorize, AI or Gemini bindings. No nonempty question is accepted.
import app from "../.open-next/worker.js";

export async function clerkQaFetch(request,env,ctx,handler=app){
  const url=new URL(request.url);
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
  return handler.fetch(request,env,ctx);
}
export default {fetch:clerkQaFetch};
