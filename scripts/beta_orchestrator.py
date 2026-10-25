#!/usr/bin/env python3
"""Conservative Beta supervisor. Never merges, deploys, changes source, or asserts QA PASS.

The tracker issue is the durable heartbeat. Human/GPT approval and verified
worker evidence are required before a task can be marked PASS. No AI agent
or self-healing code worker is claimed by this script.
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

REPO = os.environ["GH_REPOSITORY"]
TOKEN = os.environ["GH_TOKEN"]
API = "https://api.github.com"
TITLE = "[Supervisor] Beta execution tracker (B01-B24)"
TASKS = [
    "B01 Repository/worktree/PR reconciliation",
    "B02 Security baseline and exact-head CI",
    "B03 Primary-source identity and evidence",
    "B04 PR integration and controlled release",
    "B05 Drive/D1/Vectorize inventory",
    "B06 RAW partial failure root cause",
    "B07 Durable resumable checkpoints",
    "B08 Two-worker D1 lease/fencing",
    "B09 Atomic Evidence/RAW/Map publication",
    "B10 D1 and Vectorize coordinated restore",
    "B11 Safe parallel scheduler",
    "B12 Isolated parallel indexing pilot",
    "B13 Generalized document extraction quality",
    "B14 Incremental revision/rename/delete sync",
    "B15 Throughput, quotas and cost forecast",
    "B16 Full supported archive coverage",
    "B17 Architecture C benchmark",
    "B18 Real signed-in Clerk answer",
    "B19 Generalized technical QA",
    "B20 DE/EN/FA and attributed fallback",
    "B21 Confidentiality and safety",
    "B22 Mobile/auth UX and quota",
    "B23 Persistent privacy-safe answer Like",
    "B24 Independent QA and owner Beta sign-off",
]

def api(path, method="GET", data=None):
    payload = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(
        API + path, data=payload, method=method,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "beta-orchestrator-supervisor",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)

def main():
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    prs = api(f"/repos/{REPO}/pulls?state=open&per_page=100")
    issues = api(f"/repos/{REPO}/issues?state=open&per_page=100")
    tracker = next((i for i in issues if i["title"] == TITLE and "pull_request" not in i), None)
    pr_lines = "\n".join(
        f"- #{p['number']} {p['title']} ({'draft' if p['draft'] else 'open'})"
        for p in prs if p["number"] in {61, 63, 64, 65, 66, 67, 68, 69, 70, 71}
    ) or "- No matching open PRs in first 100"
    body = (
        "## Automated heartbeat — " + now + "\n\n"
        "**Mode:** supervision only. No autonomous coding agent, QA sign-off, "
        "production writes, PR merge, or deployment is active. "
        "This workflow must not claim completion based on CI alone.\n\n"
        "**Next prerequisite:** B01 reconciliation; approval and independent QA required "
        "before progressing.\n\n"
        "### Open integration PRs\n" + pr_lines + "\n\n"
        "### Beta work packages (all unverified until evidence linked)\n"
        + "\n".join(f"- [ ] {task}" for task in TASKS)
        + "\n\nSource of acceptance criteria: ROADMAP.md Beta master checklist "
        "(PR #71; not merged at creation time).\n"
        "Safety: no cost increase, no parallel production indexing, "
        "no self-approval or auto-merge.\n"
    )
    if tracker:
        # Never overwrite a human-maintained checklist or previously linked QA evidence.
        # The issue is created once; later heartbeats are appended as comments.
        number = tracker["number"]
        api(f"/repos/{REPO}/issues/{number}/comments", "POST", {
            "body": f"Supervisor heartbeat: {now}. Open PRs: {len(prs)}. "
                    "No automatic PASS or release; see Actions for evidence."
        })
    else:
        created = api(f"/repos/{REPO}/issues", "POST", {"title": TITLE, "body": body})
        number = created["number"]
    print(f"Heartbeat {now}; tracker #{number}; {len(prs)} open PRs")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write(f"### Beta supervisor heartbeat\n\n{now}; tracker #{number}.\n\n"
                      "Supervision only; execution/QA gates remain unverified.\n")
if __name__ == "__main__":
    try:
        main()
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError) as exc:
        print(f"Supervisor failed closed: {exc}", file=sys.stderr)
        sys.exit(1)
