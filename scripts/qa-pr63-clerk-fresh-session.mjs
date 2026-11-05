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

// Only a fixed stage and numeric HTTP status can leave this test. The Clerk
// SDK may include IDs, emails, headers or response contents in Error.message.
// Unknown failures are not rendered, uploaded or printed.
export function safeQaClerkStageError(stage,error){
 const allowed=new Set(["CREATE_SESSION","GET_TOKEN","VERIFY_TOKEN","AUTH_PROBE"]);
 if(!allowed.has(stage))throw Error("QA_CLERK_INVALID_STAGE");
 const status=error?.status??error?.statusCode;
 const code=Number.isInteger(status)&&status>=400&&status<=599
  ?"HTTP_"+status:"FAILED";
 return Error("QA_CLERK_"+stage+"_"+code);
}

export async function runFreshQaClerkSession({
 secretKey,userId,origin=QA_CLERK_ORIGIN,
 createClient=createClerkClient,verify=verifyToken,
 probe=verifyRealQaClerkAuth,
}={}){
 validateQaClerkIdentity(secretKey,userId);
 requireQaClerkOrigin(origin);
 let client;
 try{client=createClient({secretKey});}
 catch(error){throw safeQaClerkStageError("CREATE_SESSION",error);}
 if(!client?.sessions?.createSession||!client?.sessions?.getToken||
    !client?.sessions?.revokeSession)
   throw Error("QA_CLERK_BACKEND_SESSION_API_REQUIRED");
 let sessionId;
 let operationError;
 let revocationError;
 let result;
 try{
  let session;
  try{session=await client.sessions.createSession({userId});}
  catch(error){throw safeQaClerkStageError("CREATE_SESSION",error);}
  sessionId=session?.id;
  if(typeof sessionId!=="string"||!/^sess_[A-Za-z0-9]+$/.test(sessionId)||
     (session.userId&&session.userId!==userId))
    throw Error("QA_CLERK_TEST_SESSION_INVALID");
  // Mint only after the Worker is deployed, so no pre-built 60-second JWT expires.
  let tokenData;
  try{tokenData=await client.sessions.getToken(sessionId);}
  catch(error){throw safeQaClerkStageError("GET_TOKEN",error);}
  const token=validateQaSessionJwt(tokenData?.jwt);
  // Clerk Backend verifyToken() returns {data, errors}; not a bare JWT payload.
  // Reject real verification errors rather than relying on unchecked claims.
  let verification;
  try{verification=await verify(token,{secretKey,authorizedParties:[origin]});}
  catch(error){throw safeQaClerkStageError("VERIFY_TOKEN",error);}
  if(!verification?.data||verification?.errors?.length)
    throw Error("QA_CLERK_VERIFY_TOKEN_REJECTED");
  const claims=verification.data;
  if(claims.sub!==userId||claims.sid!==sessionId)
    throw Error("QA_CLERK_SESSION_CLAIMS_MISMATCH");
  try{result=await probe({origin,token});}
  catch(error){throw safeQaClerkStageError("AUTH_PROBE",error);}
 }catch(error){
  operationError=error;
 }finally{
  if(sessionId){
   try{await client.sessions.revokeSession(sessionId);}
   catch{revocationError=Error("QA_CLERK_OWNED_SESSION_REVOKE_FAILED");}
  }
 }
 // A session that failed revocation must never count as a clean QA result,
 // even if an earlier step also failed. Avoid leaving a live test session.
 if(revocationError)throw revocationError;
 if(operationError)throw operationError;
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
