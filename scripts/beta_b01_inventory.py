#!/usr/bin/env python3
"""B01 read-only worker and independent structural QA; never declares B01 complete."""
import datetime
import json
import os
import pathlib
import urllib.request

repo = os.environ["GH_REPOSITORY"]
token = os.environ["GH_TOKEN"]
base = "https://api.github.com"
def get(path):
    req = urllib.request.Request(base + path, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "beta-b01-worker",
    })
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)

prs = get(f"/repos/{repo}/pulls?state=open&per_page=100")
issues = get(f"/repos/{repo}/issues?state=open&per_page=100")
main = get(f"/repos/{repo}/branches/main")
entries = [{
    "number": p["number"], "title": p["title"], "draft": p["draft"],
    "head_sha": p["head"]["sha"], "base": p["base"]["ref"],
    "url": p["html_url"],
} for p in prs]
checks = {
    "main_sha_present": len(main["commit"]["sha"]) == 40,
    "pr_sha_complete": all(len(p["head_sha"]) == 40 for p in entries),
    "no_duplicate_pr_number": len({p["number"] for p in entries}) == len(entries),
    "roadmap_exists": pathlib.Path("ROADMAP.md").is_file(),
}
result = {
    "task": "B01", "status": "EVIDENCE_ONLY_NOT_PASS",
    "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "main_sha": main["commit"]["sha"], "open_prs": entries,
    "open_issues": [{"number": i["number"], "title": i["title"]}
                    for i in issues if "pull_request" not in i],
    "checks": checks,
    "limitations": [
        "Does not inspect remote PC worktrees, Drive, D1, or Vectorize",
        "Does not resolve PR conflicts or independently approve QA",
        "A passing structural check is not B01 acceptance",
    ],
}
pathlib.Path("beta-b01-evidence.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps({"task": "B01", "checks": checks, "prs": len(entries)}))
if not all(checks.values()):
    raise SystemExit("B01 inventory structural QA failed")
