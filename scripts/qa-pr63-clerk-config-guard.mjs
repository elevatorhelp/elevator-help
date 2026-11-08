import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const QA_CLERK_ORIGIN="https://elevator-help-pr63-clerk-qa.baharmand.workers.dev";
export const QA_CLERK_WORKER="elevator-help-pr63-clerk-qa";

export function requireQaClerkOrigin(value){
  let url;
  try{url=new URL(value);}catch{throw Error("QA_CLERK_ORIGIN_NOT_APPROVED");}
  if(url.href!==QA_CLERK_ORIGIN+"/"||url.origin!==QA_CLERK_ORIGIN)
    throw Error("QA_CLERK_ORIGIN_NOT_APPROVED");
  return url;
}
export function validateQaClerkConfig(config){
  assert.deepEqual(config,{
    $schema:"./node_modules/wrangler/config-schema.json",
    name:QA_CLERK_WORKER,
    main:"workers/qa-clerk-entry.mjs",
    compatibility_date:"2026-08-23",
    compatibility_flags:["nodejs_compat"],
    assets:{directory:".open-next/assets",binding:"ASSETS"},
    observability:{enabled:false},
    vars:{AUTH_REQUIRED:"true",QA_CLERK_AUTH_ONLY:"true"},
    workers_dev:true,
  },"Clerk QA requires separate no-archive, no-Gemini, auth-only Worker");
  return true;
}
export function validateRepositoryQaClerkConfig(){
  const file=resolve(fileURLToPath(new URL("../wrangler.qa-clerk.json",import.meta.url)));
  validateQaClerkConfig(JSON.parse(readFileSync(file,"utf8")));
  return true;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{validateRepositoryQaClerkConfig();
  console.log("PASS: Clerk-only Worker is distinct and cannot access D1, Vectorize or paid Gemini");}
 catch{
  console.error("::error::QA_CLERK_CONFIG_NOT_APPROVED");
  process.exitCode=1;
 }
}
