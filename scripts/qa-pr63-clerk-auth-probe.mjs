// ONE manual, non-billed, auth-only smoke of the actual Clerk SDK on a
// separate QA Worker. No nonempty question, archive, model or session logging.
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {QA_CLERK_ORIGIN,requireQaClerkOrigin} from "./qa-pr63-clerk-config-guard.mjs";

export function validateQaSessionJwt(token){
 if(typeof token!=="string"||token.length<40||token.length>8000||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
   throw Error("QA_CLERK_VALID_SESSION_REQUIRED");
 return token;
}
export async function verifyRealQaClerkAuth({
 origin=QA_CLERK_ORIGIN,token,fetchImpl=fetch,
}={}){
 const base=requireQaClerkOrigin(origin);
 validateQaSessionJwt(token);
 const url=new URL("/api/ask",base);
 const post=async(bearer,question="")=>{
  const headers={"content-type":"application/json"};
  if(bearer)headers.authorization="Bearer "+bearer;
  let response;
  try{
   response=await fetchImpl(url,{method:"POST",headers,
    body:JSON.stringify({question}),redirect:"error",signal:AbortSignal.timeout(20000)});
  }catch{throw Error("QA_CLERK_AUTH_NETWORK_OR_REDIRECT_ERROR");}
  return response.status;
 };
 assert.equal(await post(null),401,"QA_CLERK_MISSING_SESSION_NOT_REJECTED");
 assert.equal(await post("invalid.qa.session"),401,"QA_CLERK_INVALID_SESSION_NOT_REJECTED");
 // Auth is checked before question parsing. A VALID signed session reaches
 // the empty-question 400, which happens before D1 / Gemini / quota usage.
 assert.equal(await post(token),400,"QA_CLERK_VALID_SESSION_NOT_ACCEPTED");
 // The QA-only entrypoint blocks nonempty questions even with valid JWT.
 assert.equal(await post(token,"Do not answer this QA question."),403,
   "QA_CLERK_NONEMPTY_QUESTION_NOT_BLOCKED");
 return "QA_CLERK_REAL_AUTH_ONLY_VERIFIED";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await verifyRealQaClerkAuth({
    origin:process.env.QA_CLERK_ORIGIN,
    token:process.env.QA_CLERK_SESSION_JWT,
  });
  console.log("PASS: "+result);
 }catch(error){
  const s=error instanceof Error?error.message:"";
  const safe=/^QA_CLERK_[A-Z0-9_]+$/.test(s)?s:"QA_CLERK_AUTH_UNEXPECTED_FAILURE";
  console.error("::error::"+safe);
  process.exitCode=1;
 }
}
