#!/usr/bin/env bash
# Issue106 QA only: Wrangler via npx can leave descendants alive when only
# the npx launcher PID is killed. Keep each worker in its OWN Unix session.
qa106_assert_worker_group() {
  local pid="$1" pgid
  [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 ]] || return 1
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  if [[ "$pgid" != "$pid" ]]; then
    echo "::error::QA106_WORKER_PROCESS_GROUP_NOT_ISOLATED"
    return 1
  fi
}
qa106_stop_worker_group() {
  local pgid="${1:-}" current attempt
  [[ -z "$pgid" ]] && return 0
  current="$(ps -o pgid= -p "$$" 2>/dev/null | tr -d '[:space:]')"
  if [[ ! "$pgid" =~ ^[0-9]+$ || "$pgid" -le 1 || "$pgid" == "$current" ]]; then
    echo "::error::QA106_UNSAFE_PROCESS_GROUP"
    return 1
  fi
  # Negative PID addresses the entire dedicated process group, including
  # grandchildren (not just the npx wrapper). Never signal another group.
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for attempt in {1..8}; do
    if ! kill -0 -- "-$pgid" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if kill -0 -- "-$pgid" 2>/dev/null; then
    kill -KILL -- "-$pgid" 2>/dev/null || true
  fi
  wait "$pgid" 2>/dev/null || true
}
