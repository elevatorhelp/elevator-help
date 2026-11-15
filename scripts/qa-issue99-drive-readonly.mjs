/**
 * Issue #99: read-only real Google Drive service-account preflight.
 * No data modification, Gemini, Cloudflare, Production archive, or indexing.
 * Logs only coarse PASS/FAIL; no credential values or private paths.
 */
import {createHash,createSign} from "node:crypto";
import {extractText,getDocumentProxy} from "unpdf";
const ROOT="1TgIo8chX2GTD4Rdx9QCA5RrqBM64gOgC";
const FIXTURE="1ZpJMQSX3jYv8LDpaFA9Uu7iabFHuMgwz";
const MAX_PDF_BYTES=300000;
const EXPECTED_MIME="application/pdf";
function assert(ok,code){if(!ok)throw Error(code);}
function url64(value){return Buffer.from(typeof value==="string"?value:JSON.stringify(value)).toString("base64url");}
async function http(url,options={},timeoutMs=18000){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok){
    if(response.status===403||response.status===404)throw Error("QA_DRIVE_FIXTURE_NOT_ACCESSIBLE_TO_SERVICE_ACCOUNT");
    throw Error("QA_DRIVE_HTTP_"+response.status);
  }
  return response;
}
async function main(){
  const approvedBranchPush=process.env.GITHUB_EVENT_NAME==="push" &&
    process.env.GITHUB_REF==="refs/heads/qa/issue99-real-drive-readonly-20261115";
  const approvedManualQa=process.env.GITHUB_EVENT_NAME==="workflow_dispatch" &&
    process.env.GITHUB_REF==="refs/heads/main";
  assert(process.env.GITHUB_ACTIONS==="true" &&
    (approvedBranchPush||approvedManualQa),"QA_UNAPPROVED_CONTEXT");
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  assert(typeof raw==="string"&&raw.length>100,"QA_SERVICE_ACCOUNT_MISSING");
  let account;try{account=JSON.parse(raw);}catch{throw Error("QA_SERVICE_ACCOUNT_JSON_INVALID");}
  assert(account?.type==="service_account" &&
     typeof account?.client_email==="string" &&
     typeof account?.private_key==="string" &&
     account?.token_uri==="https://oauth2.googleapis.com/token",
     "QA_SERVICE_ACCOUNT_INCOMPLETE");
  const now=Math.floor(Date.now()/1000);
  const signed=url64({alg:"RS256",typ:"JWT"})+"."+url64({
    iss:account.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",
    aud:account.token_uri,iat:now,exp:now+1200
  });
  const signer=createSign("RSA-SHA256");signer.update(signed);signer.end();
  const assertion=signed+"."+signer.sign(account.private_key).toString("base64url");
  const tokenResult=await http(account.token_uri,{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const token=await tokenResult.json();
  assert(typeof token.access_token==="string","QA_GOOGLE_OAUTH_FAILED");
  console.log("PASS: existing service account authorized read-only Google OAuth token");
  const headers={Authorization:"Bearer "+token.access_token};
  // A direct file permission can be correct while parent-folder traversal is
  // still forbidden. Check these separately and identify the actual blocker.
  const direct=await http("https://www.googleapis.com/drive/v3/files/"+FIXTURE+
    "?fields=id,mimeType,size,md5Checksum,trashed",{headers});
  const directMeta=await direct.json();
  assert(directMeta.id===FIXTURE&&directMeta.mimeType===EXPECTED_MIME&&
    directMeta.trashed!==true,"QA_DIRECT_PDF_NOT_VISIBLE");
  console.log("PASS: service account can read explicitly shared QA PDF metadata");
  assert(/^[a-f0-9]{32}$/i.test(directMeta.md5Checksum||"") &&
      Number(directMeta.size)>1000 && Number(directMeta.size)<=MAX_PDF_BYTES,
      "QA_PDF_MISSING_OR_INVALID_METADATA");
  const file=await http("https://www.googleapis.com/drive/v3/files/"+FIXTURE+"?alt=media",{headers});
  const bytes=new Uint8Array(await file.arrayBuffer());
  assert(bytes.length===Number(directMeta.size) && bytes.length<=MAX_PDF_BYTES &&
    createHash("md5").update(bytes).digest("hex").toLowerCase()===directMeta.md5Checksum.toLowerCase(),
    "QA_PDF_CHECKSUM_MISMATCH");
  console.log("PASS: restricted service account downloaded real Drive PDF with matching MD5");
  const document=await getDocumentProxy(bytes,{maxImageSize:16_777_216});
  const pages=await extractText(document,{mergePages:false});
  assert(pages.totalPages===2 &&
    Array.isArray(pages.text)&&pages.text.length===2 &&
    pages.text[0].includes("QA-4711")&&
    pages.text[0].includes("QA-1.2.3")&&
    pages.text[1].includes("MOCK-DOOR-12")&&
    pages.text[1].includes("QA-2.4.6"),
    "QA_PDF_PAGE_OR_SOURCE_EXTRACTION_MISMATCH");
  console.log("PASS: real uploaded Drive PDF parsed with production unpdf engine (2 exact pages)");
  // Full runner must be able to enumerate the QA folder, not only read a
  // single explicitly shared file. Do not weaken this acceptance criterion.
  const folder=await http("https://www.googleapis.com/drive/v3/files/"+ROOT+
    "?fields=id,mimeType,trashed",{headers});
  const folderMeta=await folder.json();
  assert(folderMeta.id===ROOT&&folderMeta.mimeType==="application/vnd.google-apps.folder"&&
    folderMeta.trashed!==true,"QA_WRONG_DRIVE_FOLDER");
  console.log("PASS: service account can see separate QA folder");
  const listingUrl=new URL("https://www.googleapis.com/drive/v3/files");
  listingUrl.searchParams.set("q","'"+ROOT+"' in parents and trashed = false");
  listingUrl.searchParams.set("fields","nextPageToken,files(id,mimeType,md5Checksum,size)");
  listingUrl.searchParams.set("pageSize","100");
  const listing=await http(listingUrl,{headers});
  const metadata=await listing.json();
  const pdfFiles=(metadata.files||[]).filter(x=>x.mimeType===EXPECTED_MIME);
  assert(pdfFiles.length===1 && !metadata.nextPageToken,
    "QA_DRIVE_UNREVIEWED_PDF_IN_FIXTURE");
  const item=pdfFiles.find(x=>x.id===FIXTURE);
  assert(item?.mimeType===EXPECTED_MIME &&
    item.md5Checksum?.toLowerCase()===directMeta.md5Checksum.toLowerCase() &&
    Number(item.size)===Number(directMeta.size),
    "QA_PDF_NOT_LISTED_BY_DRIVE_FOLDER");
  console.log("PASS: exact uploaded PDF discovered by real Drive folder listing");
  console.log("QA_DRIVE_READ_ONLY_PREFLIGHT_PASS: No Cloudflare, Gemini or Production writes");
}
main().catch(e=>{
  const code=typeof e?.message==="string" && /^QA_[A-Z0-9_]+$/.test(e.message)
    ? e.message:"QA_UNKNOWN_READONLY_FAILURE";
  console.error("::error::"+code);process.exitCode=1;
});
