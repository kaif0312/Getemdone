#!/usr/bin/env bash
# Run server test files against a throwaway Firestore emulator (no credentials, project demo-nudge).
#   FIRESTORE_PORT=8085 bash scripts/test-emulator.sh scripts/tests/test_tasks.mts [more.mts ...]
# Give each parallel worktree its own FIRESTORE_PORT (8085, 8185, 8285, ...): hub/logging ports derive from it.
set -euo pipefail
PORT="${FIRESTORE_PORT:-8085}"
export NUDGE_WA_DRY_RUN=1 GCLOUD_PROJECT=demo-nudge
CMD=""
for f in "$@"; do CMD="${CMD}npx tsx $f && "; done
CMD="${CMD}echo ALL_TESTS_PASSED"
CFG="$(mktemp -d)/firebase.json"
cat > "$CFG" <<JSON
{ "emulators": { "firestore": { "port": $PORT }, "hub": { "port": $((PORT + 10)) }, "logging": { "port": $((PORT + 20)) }, "ui": { "enabled": false } } }
JSON
npx -y firebase-tools@14 emulators:exec --config "$CFG" --only firestore --project demo-nudge "$CMD"
