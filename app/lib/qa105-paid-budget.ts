/**
 * QA-only one-shot reservation. A failed or uncertain provider request is
 * never retried. A fresh worker or CI rerun cannot reset the allowance.
 * The caller must establish isolated QA bindings and authenticated test
 * identity BEFORE calling this function. Never use this table in production.
 */
export const QA105_PAID_APPROVAL = "qa105-20261124-two-calls-v1";
export const QA105_PAID_SCHEMA = `CREATE TABLE IF NOT EXISTS qa105_paid_answer_reservations (
 approval TEXT NOT NULL,
 language TEXT NOT NULL CHECK(language IN ('de','it')),
 reserved_at_ms INTEGER NOT NULL,
 PRIMARY KEY(approval,language)
)`;
type DB = {prepare(sql:string):{bind(...args:unknown[]):{first():Promise<Record<string,unknown>|null>}}};
export async function reserveQA105ModelCall(db:DB,approval:string,language:string):Promise<boolean>{
 if(approval!==QA105_PAID_APPROVAL||!["de","it"].includes(language))return false;
 const row=await db.prepare(`INSERT INTO qa105_paid_answer_reservations
 (approval,language,reserved_at_ms) VALUES (?,?,?)
 ON CONFLICT(approval,language) DO NOTHING RETURNING language`)
 .bind(approval,language,Date.now()).first();
 return row?.language===language;
}
export function qa105OneCallFetch(fetchImpl:typeof fetch, reserve:()=>Promise<boolean>):typeof fetch {
 let attempted=false;
 return async(input,init)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  if(url.origin!=="https://generativelanguage.googleapis.com"||
     !/^\/v1beta\/models\/gemini-[a-z0-9.-]+:generateContent$/.test(url.pathname)||
     init?.method!=="POST"||attempted)throw Error("QA105_PROVIDER_CALL_DENIED");
  attempted=true;
  if(!(await reserve()))throw Error("QA105_PROVIDER_RESERVATION_DENIED");
  return fetchImpl(input,{...init,redirect:"error"});
 };
}
