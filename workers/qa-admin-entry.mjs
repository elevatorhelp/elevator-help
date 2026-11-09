// Separate isolated Clerk TEST admin QA Worker; never routes to the production site.
import app from "../.open-next/worker.js";
import { QA_ADMIN_BROWSER_HTML, QA_ADMIN_BROWSER_PATH } from "./qa-admin-browser-page.mjs";

const safeHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
export async function qaAdminFetch(request, env, ctx, application = app) {
  const url = new URL(request.url);
  if (url.pathname === QA_ADMIN_BROWSER_PATH && request.method === "GET")
    return new Response(QA_ADMIN_BROWSER_HTML, {
      status: 200, headers: {...safeHeaders, "content-type":"text/html; charset=utf-8"},
    });
  if (url.pathname !== "/api/admin/status" || request.method !== "GET")
    return new Response("Not Found", {status:404,headers:safeHeaders});
  // FAIL CLOSED before calling the real application unless test-only isolation is complete.
  if (env.QA_ADMIN_AUTH_ONLY !== "true" || env.AUTH_REQUIRED !== "true" ||
      typeof env.CLERK_SECRET_KEY !== "string" ||
      !env.CLERK_SECRET_KEY.startsWith("sk_test_") ||
      typeof env.ADMIN_USER_IDS !== "string" ||
      !/^user_[A-Za-z0-9]+(?:[\s,]+user_[A-Za-z0-9]+)*$/.test(env.ADMIN_USER_IDS.trim()) ||
      env.CORTEX_DB || env.VECTORIZE || env.VECTORIZE_V2 ||
      env.AI || env.GEMINI_API_KEY)
    return new Response("QA Admin not configured", {status:503,headers:safeHeaders});
  if ((request.headers.get("authorization") || "").length > 8010)
    return new Response("Invalid authentication header", {status:401,headers:safeHeaders});
  const response = await application.fetch(request,env,ctx);
  const headers = new Headers(response.headers);
  for (const [name,value] of Object.entries(safeHeaders)) headers.set(name,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export default { fetch:qaAdminFetch };
