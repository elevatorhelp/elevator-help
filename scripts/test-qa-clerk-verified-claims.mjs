import assert from "node:assert/strict";
import {verifiedClerkClaims} from "../workers/qa-clerk-verified-claims.mjs";
const good={sub:"user_ABCDEFGHIJKL",sid:"sess_ABCDEFGHIJKL",exp:1999999999,azp:"https://example.test"};
assert.deepEqual(verifiedClerkClaims(good),{sub:good.sub,sid:good.sid});
assert.deepEqual(verifiedClerkClaims({data:good}),{sub:good.sub,sid:good.sid});
for(const v of [
 null,undefined,"not jwt",[],{}, {data:null}, {data:{}},
 {errors:[{reason:"invalid"}],data:good},
 {errors:[],data:good},
 {sub:good.sub}, {sub:good.sub,sid:"wrong"},
 {data:{...good,sub:"attacker"}}, {data:[good]},
 {data:good,errors:[{reason:"invalid"}]}
])assert.equal(verifiedClerkClaims(v),null);
console.log("PASS: Clerk verified direct/envelope payloads and fail-closed error/malformed cases");
