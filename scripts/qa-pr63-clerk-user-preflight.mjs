// Read-only identity validation BEFORE any Cloudflare QA Worker deployment.
// Never outputs user email, ID, Clerk response data or secret-bearing SDK errors.
import {createClerkClient} from "@clerk/backend";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validateQaClerkIdentity,safeQaClerkStageError} from "./qa-pr63-clerk-fresh-session.mjs";

export async function validateClerkTestUser({secretKey,userId,createClient=createClerkClient}={}){
 validateQaClerkIdentity(secretKey,userId);
 let client;
 try{client=createClient({secretKey});}
 catch(error){throw safeQaClerkStageError("CREATE_SESSION",error);}
 if(typeof client?.users?.getUser!=="function")
  throw Error("QA_CLERK_TEST_USER_API_UNAVAILABLE");
 let user;
 try{user=await client.users.getUser(userId);}
 catch(error){
  const status=error?.status??error?.statusCode;
  throw Error(Number.isInteger(status)&&status>=400&&status<=599
   ?"QA_CLERK_TEST_USER_HTTP_"+status:"QA_CLERK_TEST_USER_LOOKUP_FAILED");
 }
 if(user?.id!==userId)throw Error("QA_CLERK_TEST_USER_IDENTITY_MISMATCH");
 return "QA_CLERK_TEST_USER_LOOKUP_VERIFIED";
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  console.log("PASS: "+await validateClerkTestUser({
   secretKey:process.env.CLERK_QA_SECRET_KEY,
   userId:process.env.CLERK_QA_TEST_USER_ID,
  }));
 }catch(error){
  const message=error instanceof Error?error.message:"";
  const safe=/^QA_CLERK_[A-Z0-9_]+$/.test(message)
    ?message:"QA_CLERK_TEST_USER_LOOKUP_FAILED";
  console.error("::error::"+safe);
  process.exitCode=1;
 }
}
