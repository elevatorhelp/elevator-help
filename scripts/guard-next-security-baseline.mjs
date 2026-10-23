// Security regression gate: do not silently undo the approved Next.js security update.
// Bumping the floor requires an explicit security review and a dedicated commit.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const pkg=JSON.parse(readFileSync("package.json","utf8"));
const lock=JSON.parse(readFileSync("package-lock.json","utf8"));
const floor=[16,4,2];
function exactStableVersion(value,label){
 assert.match(value||"",/^\d+\.\d+\.\d+$/,label+" must be an exact stable version");
 return value.split(".").map(Number);
}
function atLeast(actual,minimum){
 for(let i=0;i<3;i++){
  if(actual[i]!==minimum[i])return actual[i]>minimum[i];
 }
 return true;
}
const requested=exactStableVersion(pkg.dependencies?.next,"package.json Next.js");
const installed=exactStableVersion(lock.packages?.["node_modules/next"]?.version,"lockfile Next.js");
assert.ok(atLeast(requested,floor),"SECURITY_DOWNGRADE_BLOCKED: Next.js must be >=16.4.2");
assert.ok(atLeast(installed,floor),"SECURITY_DOWNGRADE_BLOCKED: lockfile Next.js must be >=16.4.2");
assert.deepEqual(installed,requested,"Next.js manifest and lockfile must match");
assert.equal(lock.packages?.[""]?.dependencies?.next,pkg.dependencies.next,"Next.js lock root mismatches manifest");
console.log("PASS: Next.js security baseline >=16.4.2 is enforced in manifest and lockfile");
