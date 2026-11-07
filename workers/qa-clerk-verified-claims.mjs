// Normalize ONLY a successfully completed cryptographic Clerk verifyToken result.
// Never decode JWTs locally, trust caller claims, or ignore SDK errors.
export function verifiedClerkClaims(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  if(value.errors!==undefined&&value.errors!==null)return null;
  const candidate=Object.hasOwn(value,"data")?value.data:value;
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))return null;
  if(typeof candidate.sub!=="string"||!candidate.sub.startsWith("user_"))return null;
  if(typeof candidate.sid!=="string"||!candidate.sid.startsWith("sess_"))return null;
  return {sub:candidate.sub,sid:candidate.sid};
}
