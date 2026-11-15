/**
 * Strict 2-PDF Drive preflight. Google service account read-only OAuth.
 * No source, key or PDF bytes printed or saved to CI artifacts.
 */
import {createHash,createSign} from "node:crypto";
import {getDocumentProxy,extractText} from "unpdf";
import {QA106_ROOT,QA106_PDFS,QA106_CONFIRM} from "./qa-issue106-parallel-guard.mjs";
const ORIGINAL="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const SOURCE="1TS3dwWpEtnfl4E_f1-iOm_qbSkZhBSKIy4QbMzZWTh4";
const tests=[
  {id:QA106_PDFS.A,terms:[["QA-4711","QA-1.2.3"],["MOCK-DOOR-12","QA-2.4.6"]]},
  {id:QA106_PDFS.B,terms:[["QB-5724","QB-3.5.7"],["MOCK-ROTOR-21","QB-4.6.8"]]},
];
const check=(ok,code)=>{if(!ok)throw Error(code);};
const url64=v=>Buffer.from(typeof v==="string"?v:JSON.stringify(v)).toString("base64url");
async function getJson(url,opts={}){
 const r=await fetch(url,{...opts,signal:AbortSignal.timeout(24000)});
 check(r.ok,"QA106_GOOGLE_REQUEST_REJECTED");
 return r.json();
}
async function main(){
 check(process.env.GITHUB_ACTIONS==="true"&&
   process.env.GITHUB_EVENT_NAME==="workflow_dispatch"&&
   process.env.GITHUB_REF==="refs/heads/main"&&
   process.env.QA106_CONFIRMATION===QA106_CONFIRM,
   "QA106_DRIVE_UNAPPROVED");
 const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
 check(typeof raw==="string"&&raw.length>100,"QA106_SERVICE_ACCOUNT_ABSENT");
 let account;try{account=JSON.parse(raw);}catch{throw Error("QA106_SERVICE_ACCOUNT_BAD_JSON");}
 check(account.type==="service_account"&&
   account.token_uri==="https://oauth2.googleapis.com/token"&&
   typeof account.client_email==="string"&&typeof account.private_key==="string",
   "QA106_SERVICE_ACCOUNT_INVALID");
 const now=Math.floor(Date.now()/1000);
 const unsigned=url64({alg:"RS256",typ:"JWT"})+"."+url64({
   iss:account.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",
   aud:account.token_uri,iat:now,exp:now+1200
 });
 const signer=createSign("RSA-SHA256");
 signer.update(unsigned);signer.end();
 const jwt=unsigned+"."+signer.sign(account.private_key).toString("base64url");
 const token=await getJson(account.token_uri,{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({
     grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
     assertion:jwt,
   })
 });
 check(typeof token.access_token==="string","QA106_OAUTH_FAILED");
 const headers={Authorization:"Bearer "+token.access_token};
 const root=await getJson("https://www.googleapis.com/drive/v3/files/"+QA106_ROOT+
   "?fields=id,mimeType,trashed",{headers});
 check(root.id===QA106_ROOT&&root.mimeType==="application/vnd.google-apps.folder"&&
   root.trashed!==true,"QA106_WRONG_DRIVE_ROOT");
 const listing=new URL("https://www.googleapis.com/drive/v3/files");
 listing.searchParams.set("q","'"+QA106_ROOT+"' in parents and trashed = false");
 listing.searchParams.set("fields","nextPageToken,files(id,mimeType,size,md5Checksum,trashed)");
 listing.searchParams.set("pageSize","100");
 const all=await getJson(listing,{headers});
 const allowed=new Set([ORIGINAL,SOURCE,QA106_PDFS.A,QA106_PDFS.B]);
 check(Array.isArray(all.files)&&all.files.length===4&&!all.nextPageToken&&
   all.files.every(f=>allowed.has(f.id))&&
   all.files.filter(f=>f.mimeType==="application/pdf").length===3,
   "QA106_UNREVIEWED_DRIVE_FILE");
 for(const item of tests){
   const entry=all.files.find(f=>f.id===item.id);
   check(entry?.mimeType==="application/pdf"&&
      /^[a-f0-9]{32}$/i.test(entry.md5Checksum)&&
      Number(entry.size)>1000&&Number(entry.size)<300000,
      "QA106_PDF_NOT_IN_REVIEWED_FOLDER");
   const res=await fetch("https://www.googleapis.com/drive/v3/files/"+
      item.id+"?alt=media",{headers,signal:AbortSignal.timeout(25000)});
   check(res.ok,"QA106_PDF_READ_FORBIDDEN");
   const bytes=new Uint8Array(await res.arrayBuffer());
   check(bytes.length===Number(entry.size)&&
     createHash("md5").update(bytes).digest("hex").toLowerCase()===
        entry.md5Checksum.toLowerCase(),"QA106_PDF_MD5_CHANGED");
   const pdf=await getDocumentProxy(bytes,{maxImageSize:16_777_216});
   const pages=await extractText(pdf,{mergePages:false});
   check(pages.totalPages===2&&Array.isArray(pages.text)&&pages.text.length===2&&
      item.terms.every((terms,i)=>terms.every(t=>pages.text[i].includes(t))),
      "QA106_PDF_PAGE_CLAUSE_MISMATCH");
 }
 console.log("PASS: exactly 2 new distinct, two-page synthetic QA PDFs readable by service account");
 console.log("PASS: MD5/source-page/section codes match, QA folder contains only reviewed fixtures");
 console.log("QA106_DRIVE_PREPAY_READONLY_PASS");
}
main().catch(e=>{
 const c=String(e?.message||"");
 console.error("::error::"+(/^QA106_[A-Z0-9_]+$/.test(c)?c:"QA106_DRIVE_PREFLIGHT_FAILED"));
 process.exitCode=1;
});
