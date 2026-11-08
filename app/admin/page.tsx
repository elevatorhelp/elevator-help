"use client";

import { useAuth, SignInButton } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

type Run = { id: number; name: string; status: string; conclusion: string | null; createdAt: string | null; sha: string | null; url: string | null };
type Status = {
  checkedAt: string;
  edgeTraffic: { windowStart: string; windowEnd: string; visits: number | null; countries: Array<{ country: string; visits: number }>; warning: string | null } | null;
  archiveInventory: { indexedEvidenceFiles: number; evidenceChunks: number; note: string } | null;
  archiveRunMetrics: { supportedFiles: number; pending: { evidence: number; raw: number; map: number }; processed: { evidence: number; raw: number; map: number }; selectedPhase: string; attempted: number | null; failed: number | null; pendingOperations: number; newFiles: null; estimatedRemainingDays: null; warning: string } | null;
  activeQuestionUsers: { dau: number; mau30d: number; questionsToday: number; observationDay: string; definition: string } | null;
  deploy: Run | null; build: Run | null; archive: Run | null;
  pr63: { draft: boolean; state: string; sha: string | null; url: string };
  recentRuns: Run[];
  agents: { worker: string; supervisor: string; manager: string };
  metrics: { users: number | null; requests: number | null; latencyP95: number | null; geminiCost: number | null; archiveProgress: number | null };
  sources: { github: string; agents: string; usage: string };
};
const fmt = (n: number | null | undefined) => n == null ? "Not available" : new Intl.NumberFormat("en-US").format(n);
const fraction = (done: number | undefined, total: number | undefined) => done == null || total == null || total < 1 || done < 0 || done > total ? "Not available" : `${fmt(done)} / ${fmt(total)} (${(100 * done / total).toFixed(1)}%)`;
const runStatus = (r: Run | null) => !r ? "Not available" : (r.conclusion || r.status).toUpperCase();
const githubUrl = (url: string | null) => url && /^https:\/\/github\.com\/elevatorhelp\/elevator-help\//.test(url) ? url : null;

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="adminStat"><p>{label}</p><strong>{value}</strong><small>{note}</small></article>;
}
function RunCard({ title, run }: { title: string; run: Run | null }) {
  return <article className="adminPanel"><div className="adminFlex"><h2>{title}</h2><span className="adminTag">{runStatus(run)}</span></div>
    <p className="adminSecondary">{run?.createdAt ? new Date(run.createdAt).toLocaleString("de-DE") : "No recent run recorded"}</p>
    {run?.sha && <p className="adminMono">Commit {run.sha}</p>}
    {githubUrl(run?.url || null) && <a className="adminLink" href={run!.url!} rel="noreferrer" target="_blank">Open verified GitHub run ↗</a>}
  </article>;
}
function AdminConsole() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!isSignedIn) return;
    // Clear the previous administrator's response before validating a fresh session.
    // Never display cached private metrics while a different account/token is checked.
    setData(null); setBusy(true); setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in to see this dashboard.");
      const response = await fetch("/api/admin/status", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your account is not authorized as an administrator." : response.status === 503 ? "Admin access has not been configured." : "Dashboard data is unavailable (" + response.status + ").");
      setData(await response.json() as Status);
    } catch (e) { setData(null); setError(e instanceof Error ? e.message : "Unable to load dashboard."); }
    finally { setBusy(false); }
  }, [getToken, isSignedIn]);
  useEffect(() => { if (isLoaded && isSignedIn) void load(); }, [isLoaded, isSignedIn, load]);
  if (!isLoaded) return <main className="adminShell"><p>Loading sign-in…</p></main>;
  if (!isSignedIn) return <main className="adminShell"><h1>Admin dashboard</h1><p>Administrator sign-in is required.</p><SignInButton mode="modal"><button className="adminButton">Sign in</button></SignInButton></main>;
  return <main className="adminShell">
    <header className="adminHeader"><div><p className="adminEyebrow">ELEVATOR.HELP / PRIVATE</p><h1>Admin Monitoring</h1><p>One overview for the site, archive and engineering operations.</p></div><button className="adminButton" onClick={()=>void load()} disabled={busy}>{busy ? "Loading…" : "Refresh"}</button></header>
    {error && <div className="adminError" role="alert">{error}</div>}
    {data && <>
      <div className="adminMeta">Last checked: {new Date(data.checkedAt).toLocaleString("de-DE")} · Live GitHub data; usage analytics not yet connected</div>
      <section aria-label="Archive and traffic"><h2>Archive and audience</h2>
        <div className="adminGrid">
          <Stat label="Files with indexed evidence" value={fmt(data.archiveInventory?.indexedEvidenceFiles)} note="D1 exact-evidence files only; total Drive files not yet connected"/>
          <Stat label="New files since prior snapshot" value={fmt(data.archiveRunMetrics?.newFiles)} note="Needs verified historical Drive scan; phase backlog is not new-file count"/>
          <Stat label="Evidence chunks in D1" value={fmt(data.archiveInventory?.evidenceChunks)} note="Exact-evidence inventory; not equivalent to RAW/Map completion"/>
          <Stat label="Supported Drive files" value={fmt(data.archiveRunMetrics?.supportedFiles)} note="From latest completed Drive scan in GitHub Actions"/>
          <Stat label="Evidence indexed in Drive scope" value={fraction(data.archiveRunMetrics?.processed.evidence, data.archiveRunMetrics?.supportedFiles)} note={data.archiveRunMetrics ? `${fmt(data.archiveRunMetrics.pending.evidence)} still pending · start-of-run snapshot` : "Snapshot not available"}/>
          <Stat label="RAW vectors completed" value={fraction(data.archiveRunMetrics?.processed.raw, data.archiveRunMetrics?.supportedFiles)} note={data.archiveRunMetrics ? `${fmt(data.archiveRunMetrics.pending.raw)} still pending · start-of-run snapshot` : "Snapshot not available"}/>
          <Stat label="Document maps completed" value={fraction(data.archiveRunMetrics?.processed.map, data.archiveRunMetrics?.supportedFiles)} note={data.archiveRunMetrics ? `${fmt(data.archiveRunMetrics.pending.map)} still pending · start-of-run snapshot` : "Snapshot not available"}/>
          <Stat label="Pending phase operations" value={fmt(data.archiveRunMetrics?.pendingOperations)} note="Evidence + RAW + Map; not unique files; may be changed by run processing"/>
          <Stat label="Remaining time / ETA" value="Not available" note="Needs observed completed phase operations over multiple runs, not file attempts"/>
          <Stat label="All-time site visits" value="Not available" note="Not reconstructable before measurement; never extrapolate"/>
          <Stat label="Visits · last 7 days" value={fmt(data.edgeTraffic?.visits)} note="Cloudflare edge visits, only if analytics connected; not unique people"/>
          <Stat label="Active question users · DAU" value={fmt(data.activeQuestionUsers?.dau)} note="Signed-in users who asked today, Berlin calendar"/>
          <Stat label="Active question users · 30-day" value={fmt(data.activeQuestionUsers?.mau30d)} note="Distinct users who asked in the trailing 30 days; not all visitors"/>
          <Stat label="Questions today" value={fmt(data.activeQuestionUsers?.questionsToday)} note="Daily quota usage sum; may exclude failed/released questions"/>
          <Stat label="Visits by country" value={data.edgeTraffic?.countries?.length ? data.edgeTraffic.countries.slice(0, 5).map(c => `${c.country}: ${fmt(c.visits)}`).join(" · ") : "Not available"} note="Last 7 days; edge visits grouped by approximate IP country, not unique users"/>
          <Stat label="Questions / cost / latency" value="Not available" note="Requires real server-side telemetry"/>
        </div>
      </section>
      <section aria-label="Operations"><h2>Operations</h2><div className="adminGrid adminGrid3">
        <RunCard title="Production Deploy" run={data.deploy}/><RunCard title="Build Check" run={data.build}/><RunCard title="Archive Sync" run={data.archive}/>
      </div></section>
      <section aria-label="Engineering agents"><h2>Engineering management</h2>
        <div className="adminGrid adminGrid3">
          <Stat label="Development Worker" value="Not connected" note="Automation history adapter required"/>
          <Stat label="Independent Supervisor" value="Not connected" note="Automation history adapter required"/>
          <Stat label="Project Manager" value="Not connected" note="Automation history adapter required"/>
        </div>
        <article className="adminPanel"><h2>PR #63 · Release closure</h2><p className="adminSecondary">Head: {data.pr63.sha || "Unknown"} · {data.pr63.state === "unknown" ? "Status unavailable" : data.pr63.draft ? "Draft" : "Not draft"} · {data.pr63.state}</p><a className="adminLink" href={data.pr63.url} target="_blank" rel="noreferrer">Open PR #63 ↗</a></article>
      </section>
      <section aria-label="Latest workflow runs"><h2>Latest workflow runs</h2><div className="adminPanel"><ul className="adminRuns">{data.recentRuns.map(run => <li key={run.id}><span>{run.name} <small>{run.sha}</small></span><span>{runStatus(run)} {githubUrl(run.url) && <a className="adminLink" href={run.url!} target="_blank" rel="noreferrer">Details ↗</a>}</span></li>)}</ul></div></section>
    </>}
    <footer className="adminFooter"><a href="/">← Back to elevator.help</a> · No raw IPs or individual visitor locations are collected by this page.</footer>
    <style>{`
      .adminShell{max-width:1160px;margin:0 auto;padding:35px 22px 65px;font-family:Arial,Helvetica,sans-serif;color:#1c2921}
      .adminHeader{display:flex;justify-content:space-between;align-items:center;gap:18px;padding-bottom:24px;border-bottom:1px solid #dce5df}
      .adminHeader h1{font-size:clamp(30px,5vw,48px);margin:8px 0;letter-spacing:-.05em}.adminHeader p{color:#66756b;margin:0}
      .adminEyebrow{font-size:11px;letter-spacing:.13em;font-weight:700;color:#188c47!important}
      .adminButton{background:#176d42;color:white;border:0;border-radius:10px;padding:12px 19px;cursor:pointer;font-weight:700}.adminButton:disabled{opacity:.5}
      .adminShell section{margin-top:32px}.adminShell section>h2{font-size:19px;margin:0 0 14px}
      .adminGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.adminGrid3{grid-template-columns:repeat(3,minmax(0,1fr))}
      .adminStat,.adminPanel{padding:20px;border-radius:15px;border:1px solid #dbe7de;background:white;min-width:0}
      .adminStat p{color:#647168;font-size:12px;margin:0 0 13px}.adminStat strong{font-size:20px;display:block;overflow-wrap:anywhere}
      .adminStat small{display:block;color:#7c8980;line-height:1.45;margin-top:10px;font-size:11px}
      .adminFlex{display:flex;align-items:start;justify-content:space-between;gap:10px}.adminPanel h2{margin:0;font-size:16px}
      .adminTag{font-size:10px;border-radius:6px;padding:5px 8px;background:#eaf1ec;font-weight:700}
      .adminSecondary,.adminMeta,.adminMono{font-size:12px;color:#6e7b71;line-height:1.6}.adminMeta{margin-top:15px}
      .adminLink{color:#147a43;text-decoration:underline;font-size:12px}.adminError{background:#fff0ee;color:#8b2828;padding:15px;margin:20px 0;border-radius:10px}
      .adminRuns{padding:0;margin:0;list-style:none}.adminRuns li{display:flex;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid #e6ebe7;padding:11px 0;font-size:12px}.adminRuns li:last-child{border:0}
      .adminRuns li small{display:block;color:#8a968d}.adminFooter{margin-top:32px;color:#637168;font-size:12px}.adminFooter a{text-decoration:underline}
      @media(max-width:900px){.adminGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.adminGrid3{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:550px){.adminGrid,.adminGrid3{grid-template-columns:1fr}.adminHeader{align-items:start;flex-direction:column}.adminRuns li{align-items:start;flex-direction:column}}
    `}</style>
  </main>;
}

export default function AdminPage() {
  // RootLayout only installs ClerkProvider if a publishable key exists.
  // Never invoke useAuth during static prerender of an unconfigured environment.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <main className="adminShell" style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <h1>Admin dashboard unavailable</h1>
      <p>Administrator sign-in is not configured in this environment.</p>
    </main>;
  }
  return <AdminConsole />;
}
