#!/usr/bin/env bash
# Completely offline regression: two isolated nested process trees, no Cloudflare,
# Google Drive, Gemini, network, paid API or production credentials.
set -Eeuo pipefail
source scripts/qa-issue106-worker-process-group.sh
A="" B=""
cleanup() {
  qa106_stop_worker_group "$A" || true
  qa106_stop_worker_group "$B" || true
}
trap cleanup EXIT
live_count() {
  ps -eo pgid=,stat= | awk -v group="$1" '$1==group && $2 !~ /^Z/ {n++} END {print n+0}'
}
A="$(qa106_spawn_worker_group /dev/null bash -c 'bash -c "sleep 60 & wait" & wait')"
B="$(qa106_spawn_worker_group /dev/null bash -c 'bash -c "sleep 60 & wait" & wait')"
qa106_assert_worker_group "$A"
qa106_assert_worker_group "$B"
sleep 0.3
[[ "$(live_count "$A")" -ge 2 && "$(live_count "$B")" -ge 2 ]] || {
  echo "::error::QA106_OFFLINE_NESTED_WORKERS_NOT_RUNNING"; exit 1;
}
oldA="$A"
qa106_stop_worker_group "$A"
A=""
[[ "$(live_count "$oldA")" == 0 ]] || {
  echo "::error::QA106_OFFLINE_WORKER_A_DESCENDANT_SURVIVED"; exit 1;
}
[[ "$(live_count "$B")" -ge 2 ]] || {
  echo "::error::QA106_OFFLINE_WORKER_B_INTERRUPTED"; exit 1;
}
echo "PASS: stopping worker A terminates nested descendants; independent worker B remains running (no paid calls)"
