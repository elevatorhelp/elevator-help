#!/usr/bin/env python3
"""Static fail-closed safety regression for the B01 manager gate."""
from pathlib import Path

workflow = Path(".github/workflows/beta-b01-manager-gate.yml").read_text(encoding="utf-8")
assert "workflow_run:" in workflow
assert 'workflows: ["Beta B01 Independent QA"]' in workflow
assert "head_branch == 'main'" in workflow
assert "permissions:\n  actions: read\n  contents: read" in workflow
assert "WAITING_GPT_REVIEW" in workflow
assert "BLOCKED_QA" in workflow
assert 'run["head_sha"] == os.environ["QA_HEAD_SHA"]' in workflow
assert "workflow_dispatch:" not in workflow
assert "pull_request_target:" not in workflow
assert "issues: write" not in workflow
assert "contents: write" not in workflow
assert "secrets." not in workflow
assert "codex exec" not in workflow
print("B01 manager gate safety regression: PASS (static only; no live run)")
