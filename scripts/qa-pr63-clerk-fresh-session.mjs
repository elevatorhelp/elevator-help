// Creates ONE short-lived Clerk TEST-instance session immediately before
// calling the separate QA-only Worker. Always revokes the owned test session.
// Never creates users, accesses production, calls Gemini, or writes archive data.
import assert from "node:assert/strict";
import {createClerkClient,verifyToken} from "@clerk/backend";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {QA_CLERK_ORIGIN,requireQaClerkOrigin} from "./qa-pr63-clerk-config-guard.mjs";
import {validateQaSessionJwt,verifyRealQaClerkAuth} from "./qa-pr63-clerk-auth-probe.mjs";

export function validateQaClerkIdentity(secretKey,userId){
 if(typeof secretKey!=="string"||!secretKey.startsWith("sk_test_"))
  throw Error("QA_CLERK_TEST_INSTANCE_SECRET_REQUIRED");
 if(typeof userId!=="string"||!/^user_[A-Za-z0-9]{8,64}$/.test(userId))
  throw Error("QA_CLERK_TEST_USER_REQUIRED");
 return {secretKey,userId};
}

export async function runFreshQaClerkSession({
 secretKey,userId,origin=QA_CLERK_ORIGIN,
 createClient=createClerkClient,verify=verifyToken,
 probe=verifyRealQaClerkAuth,
}={}){
 validateQaClerkIdentity(secretKey,userId);
 requireQaClerkOrigin(origin);
 const client=createClient({secretKey});
 assert.ok(client?.sessions?.createSession&&client?.sessions?.getToken&&
  client?.sessions?.revokeSession,"QA_CLERK_BACKEND_SESSION_API_REQUIRED");
 let sessionId;
 let revocationError;
 let result;
 try{
  const session=await client.sessions.createSession({userId});
  sessionId=session?.id;
  if(typeof sessionId!=="string"||!/^sess_[A-Za-z0-9]+$/.test(sessionId)||
     (session.userId&&session.userId!==userId))
    throw Error("QA_CLERK_TEST_SESSION_INVALID");
  // Mint only after the Worker is deployed, so no pre-built 60-second JWT expires.
  const tokenData=await client.sessions.getToken(sessionId);
  const token=validateQaSessionJwt(tokenData?.jwt);
  // Verify locally against the pinned QA origin BEFORE sending the bearer.
  const claims=await verify(token,{secretKey,authorizedParties:[origin]});
  if(claims?.sub!==userId||claims?.sid!==sessionId)
   throw Error("QA_CLERK_SESSION_CLAIMS_MISMATCH");
  result=await probe({origin,token});
 }finally{
  if(sessionId){
   try{await client.sessions.revokeSession(sessionId);}
   catch{revocationError=Error("QA_CLERK_OWNED_SESSION_REVOKE_FAILED");}
  }
 }
 if(revocationError)throw revocationError;
 if(result!=="QA_CLERK_REAL_AUTH_ONLY_VERIFIED")
  throw Error("QA_CLERK_AUTH_PROBE_INCOMPLETE");
 return "QA_CLERK_FRESH_TEST_SESSION_VERIFIED_AND_REVOKED";
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await runFreshQaClerkSession({
   secretKey:process.env.CLERK_QA_SECRET_KEY,
   userId:process.env.CLERK_QA_TEST_USER_ID,
   origin:process.env.QA_CLERK_ORIGIN,
  });
  console.log("PASS: "+result);
 }catch(error){
  const message=error instanceof Error?error.message:"";
  // Even if the Clerk SDK includes user info, HTTP response or credentials
  // in thrown errors, only a strict fixed category is printed.
  const safe=/^QA_CLERK_[A-Z0-9_]+$/.test(message)
   ?message:"QA_CLERK_TEST_SESSION_FAILED";
  console.error("::error::"+safe);
  process.exitCode=1;
 }
}
