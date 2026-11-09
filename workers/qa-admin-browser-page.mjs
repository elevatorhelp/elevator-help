// Isolated, non-production browser sign-in probe. Never renders or logs JWTs.
// No user account, credential, JWT or publishable key is persisted by this page.
export const QA_ADMIN_BROWSER_PATH = "/qa-admin-test";
export const QA_ADMIN_BROWSER_HTML = String.raw`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Monitoring — isolated Clerk TEST QA</title>
<style>body{font:16px system-ui,sans-serif;max-width:620px;margin:3rem auto;padding:0 1rem;line-height:1.5}input{width:100%;box-sizing:border-box;padding:.65rem}button{margin:.6rem .5rem .6rem 0;padding:.65rem 1rem;cursor:pointer}#status{white-space:pre-wrap;border:1px solid #ddd;padding:1rem;min-height:2rem}small{color:#555}#sign-in{margin-top:1rem}</style>
</head><body>
<h1>Admin Monitoring — Clerk TEST sign-in</h1>
<p>This isolated QA Worker uses only the Clerk TEST instance. It has no D1, Gemini, AI or Vectorize bindings and cannot change Production. Sign in with your dedicated test account.</p>
<label for="pk">Clerk TEST publishable key (pk_test_...)</label>
<input id="pk" type="text" spellcheck="false" autocomplete="off" placeholder="pk_test_..." aria-label="Clerk test publishable key">
<button id="load">Load test sign-in</button>
<button id="check" disabled>Check admin access</button>
<p><small>Do not enter any secret key (sk_test_), password or JWT into this field. The sign-in form is served by Clerk. The JWT is sent only to this QA Worker, never displayed, logged or saved.</small></p>
<pre id="status" role="status">Ready. Paste only the public TEST publishable key.</pre>
<div id="sign-in"></div>
<script>
(() => {
  "use strict";
  const status=document.getElementById("status");
  const load=document.getElementById("load");
  const check=document.getElementById("check");
  const input=document.getElementById("pk");
  const report=(s)=>{status.textContent=s;};
  let clerk=null;
  async function externalScript(src,publishableKey){
    await new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=src;script.crossOrigin="anonymous";
      if(publishableKey)script.dataset.clerkPublishableKey=publishableKey;
      script.onload=resolve;script.onerror=()=>reject(Error("Clerk script loading failed"));
      document.head.appendChild(script);
    });
  }
  load.addEventListener("click",async()=>{
    load.disabled=true;
    try{
      const pk=input.value.trim();
      if(!/^pk_test_[A-Za-z0-9_-]{12,512}$/.test(pk))throw Error("Only a Clerk TEST publishable key is accepted");
      const encoded=pk.slice("pk_test_".length);
      const decoded=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));
      const host=decoded.replace(/\$$/,"");
      if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.accounts\.dev$/.test(host))
        throw Error("Not a Clerk development Frontend API host");
      input.value=""; // Avoid retaining even the public key in the input.
      report("Loading Clerk TEST instance...");
      await externalScript("https://"+host+"/npm/@clerk/ui@1/dist/ui.browser.js");
      // ClerkJS script-tag mode REQUIRES data-clerk-publishable-key.
      // Loading the JS without this attribute leaves window.Clerk uninitialized.
      await externalScript("https://"+host+"/npm/@clerk/clerk-js@6/dist/clerk.browser.js",pk);
      clerk=window.Clerk;
      if(!clerk||typeof clerk.load!=="function")throw Error("Clerk SDK unavailable");
      await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
      check.disabled=false;
      if(clerk.isSignedIn){report("Clerk signed-in session detected. Press Check.");}
      else {clerk.mountSignIn(document.getElementById("sign-in"));report("Complete sign-in using the Clerk form, then press Check.");}
    }catch{
      report("Unable to initialize the TEST Clerk frontend. Verify the development publishable key and browser domain configuration.");
      load.disabled=false;
    }
  });
  check.addEventListener("click",async()=>{
    check.disabled=true;
    try{
      const token=await clerk?.session?.getToken();
      if(!token){report("NO_SESSION: sign in through Clerk first.");return;}
      const request=async(authorization)=>{
        const headers={};
        if(authorization)headers.authorization="Bearer "+authorization;
        const response=await fetch("/api/admin/status",{method:"GET",headers,cache:"no-store",redirect:"error"});
        return response.status;
      };
      const invalid=await request("invalid.qa.session");
      const missing=await request(null);
      const valid=await request(token);
      if(invalid===401&&missing===401&&valid===200){
        report("PASS: signed-in admin accepted (200), invalid and missing tokens rejected (401).");
      }else if(invalid===401&&missing===401&&valid===403){
        report("PASS: signed-in non-admin rejected (403), invalid and missing tokens rejected (401).");
      }else if(invalid===503&&missing===503&&valid===503){
        report("NOT CONFIGURED: isolated QA needs Clerk TEST secret and allowed test-admin identity (503).");
      }else{
        report("FAIL: received missing="+missing+", invalid="+invalid+", signed-in="+valid+". No JWT or claims are displayed.");
      }
    }catch{report("QA_NETWORK_ERROR: request failed. No JWT or private details logged.");}
    finally{check.disabled=false;}
  });
})();
</script>
</body></html>`;
