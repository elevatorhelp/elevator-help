import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../lib/admin-authorization";
import { readEdgeTraffic } from "../../../lib/admin-cloudflare-analytics";
import { readPublishedEvidenceInventory } from "../../../lib/admin-archive-inventory";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type Run = { id: number; name: string; status: string; conclusion: string | null; html_url: string; head_sha: string; created_at: string };
const githubHeaders = { "Accept": "application/vnd.github+json", "User-Agent": "elevator-help-admin-console" };
const repo = "elevatorhelp/elevator-help";

async function readJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: githubHeaders, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error("upstream_status_" + res.status);
  return res.json();
}
function safeRun(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<Run>;
  if (typeof r.name !== "string" || typeof r.id !== "number") return null;
  return {
    id: r.id, name: r.name, status: String(r.status || "unknown"),
    conclusion: r.conclusion === null ? null : String(r.conclusion || "unknown"),
    createdAt: typeof r.created_at === "string" ? r.created_at : null,
    sha: typeof r.head_sha === "string" ? r.head_sha.slice(0,12) : null,
    url: typeof r.html_url === "string" && /^https:\/\/github\.com\/elevatorhelp\/elevator-help\/actions\/runs\/\d+$/.test(r.html_url) ? r.html_url : null,
  };
}
export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request, {
    secret: process.env.CLERK_SECRET_KEY,
    allowedIds: process.env.ADMIN_USER_IDS,
  });
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
  if (!auth.ok) return NextResponse.json({ error: auth.status === 503 ? "Admin access is not configured" : "Access denied" }, { status: auth.status, headers });

  try {
    // Optional read-only D1 summary. If Worker context/binding is absent, report N/A.
    let archiveInventory = null;
    try {
      const { env } = getCloudflareContext();
      archiveInventory = await readPublishedEvidenceInventory((env as unknown as { CORTEX_DB?: Parameters<typeof readPublishedEvidenceInventory>[0] }).CORTEX_DB);
    } catch {
      archiveInventory = null;
    }
    const [runsRaw, prRaw, edgeTraffic] = await Promise.all([
      readJson("https://api.github.com/repos/" + repo + "/actions/runs?per_page=40"),
      readJson("https://api.github.com/repos/" + repo + "/pulls/63"),
      readEdgeTraffic({
        zoneId: process.env.CLOUDFLARE_ZONE_ID,
        token: process.env.CLOUDFLARE_ANALYTICS_TOKEN,
      }),
    ]);
    const list = runsRaw && typeof runsRaw === "object" && Array.isArray((runsRaw as {workflow_runs?:unknown[]}).workflow_runs)
      ? (runsRaw as {workflow_runs:unknown[]}).workflow_runs : [];
    const runs = list.map(safeRun).filter((r): r is NonNullable<typeof r> => r !== null);
    const pr = prRaw && typeof prRaw === "object" ? prRaw as Record<string, unknown> : {};
    const head = pr.head && typeof pr.head === "object" ? pr.head as Record<string, unknown> : {};
    const archive = runs.find(r => r.name.startsWith("Live Archive sync")) || null;
    const deploy = runs.find(r => r.name === "Deploy production") || null;
    const build = runs.find(r => r.name === "Build Check") || null;
    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      deploy, build, archive,
      pr63: { draft: pr.draft === true, state: typeof pr.state === "string" ? pr.state : "unknown",
        sha: typeof head.sha === "string" ? head.sha.slice(0,12) : null,
        url: "https://github.com/elevatorhelp/elevator-help/pull/63" },
      recentRuns: runs.slice(0, 12),
      edgeTraffic,
      archiveInventory,
      agents: { worker: "not_connected", supervisor: "not_connected", manager: "not_connected" },
      metrics: { users: null, requests: null, latencyP95: null, geminiCost: null, archiveProgress: null },
      sources: { github: "GitHub Actions REST API", agents: "not connected", usage: "not instrumented" },
    }, { headers });
  } catch {
    return NextResponse.json({ error: "GitHub status temporarily unavailable" }, { status: 502, headers });
  }
}
