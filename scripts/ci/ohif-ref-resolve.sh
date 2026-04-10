#!/usr/bin/env bash
# Resolves OHIF/Viewers ref from workflow_dispatch input or PR body line:
#   OHIF_REF: <branch-or-tag>
# Writes OHIF_REF to GITHUB_ENV for subsequent steps.
#
# Required env: EVENT_NAME, GITHUB_ENV
# Optional: GH_TOKEN, REPO, PR_NUMBER (required for pull_request body parse)
# Optional: OHIF_REF_INPUT (workflow_dispatch), DEFAULT_REF (default: master)

set -e

DEFAULT_REF="${DEFAULT_REF:-master}"

if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
  REF="${OHIF_REF_INPUT:-}"
  if [[ -z "$REF" ]]; then
    REF="$DEFAULT_REF"
  fi
  echo "::notice::OHIF ref (workflow_dispatch): ${REF}"
elif [[ "$EVENT_NAME" == "pull_request" ]]; then
  REF=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}" --jq '.body' \
    | sed -n 's/^[[:space:]]*OHIF_REF:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)
  if [[ -z "$REF" ]]; then
    REF="$DEFAULT_REF"
  fi
  echo "::notice::OHIF ref from PR body (or default): ${REF}"
else
  REF="$DEFAULT_REF"
  echo "::notice::OHIF ref (fallback): ${REF}"
fi

echo "OHIF_REF=${REF}" >> "$GITHUB_ENV"
