// QA-only protected entrypoint. The actual application Worker is unchanged.
// The runner receives a disposable QA token; it never handles GEMINI_API_KEY.
import app from "../.open-next/worker.js";
export default {
 async fetch(request,env,ctx){
   const expected=env.QA_INGESTION_TOKEN;
   if(!expected||request.headers.get("authorization")!==`Bearer ${expected}`)
     return new Response("Forbidden",{status:403});
   // Only the ingestion endpoint is exposed in this temporary QA deployment.
   const url=new URL(request.url);
   if(url.pathname!=="/api/drive-ingest-batch"||request.method!=="POST")
     return new Response("Not Found",{status:404});
   return app.fetch(request,env,ctx);
 }
};
