#!/usr/bin/env bash
# Resolves OHIF/Viewers ref from workflow_dispatch input or PR body line:
#   OHIF_REF: <branch-or-tag>
#   ohif_ref: <branch-or-tag>
# Validates the resolved ref, then writes OHIF_REF to GITHUB_ENV for subsequent
# steps. An invalid ref is a hard failure, not a fallback to the default.
#
# Required env: EVENT_NAME, GITHUB_ENV
# Optional: GH_TOKEN, REPO, PR_NUMBER (required for pull_request body parse)
# Optional: OHIF_REF_INPUT (workflow_dispatch), DEFAULT_REF (default: master)

set -e

DEFAULT_REF="${DEFAULT_REF:-master}"

if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
  REF="${OHIF_REF_INPUT:-}"
  SOURCE="workflow_dispatch"
elif [[ "$EVENT_NAME" == "pull_request" ]]; then
  REF=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}" --jq '.body' \
    | sed -n '/^[[:space:]]*[Oo][Hh][Ii][Ff]_[Rr][Ee][Ff]:[[:space:]]*/{
      s/^[[:space:]]*[Oo][Hh][Ii][Ff]_[Rr][Ee][Ff]:[[:space:]]*\([^[:space:]]*\).*/\1/p
      q
    }')
  SOURCE="PR body"
else
  REF=""
  SOURCE="fallback"
fi

if [[ -z "$REF" ]]; then
  REF="$DEFAULT_REF"
  SOURCE="${SOURCE}, defaulted"
fi

# On a fork PR this value is attacker-controlled: it is read out of the PR body,
# then consumed by later steps as a checkout ref and — via GITHUB_ENV — as a
# value those steps log. Validate it against a conservative git ref grammar
# before it goes anywhere.
#
# What the grammar bars, and why each matters:
#   - whitespace and newlines: a newline would let the value append extra
#     entries to GITHUB_ENV (a key=value file) or emit its own ::workflow
#     commands into the log
#   - a leading '-' or '.': makes the value look like a flag to a later command
#   - '..': a ref path escape
#   - shell metacharacters generally: the workflow reads this as $OHIF_REF
#     rather than interpolating it, so this is the second line of defence
#     rather than the only one
#
# Fails loudly instead of silently falling back to the default, so a rejected
# ref is diagnosable from the job log. The rejected value is deliberately NOT
# echoed — no need to put attacker-supplied text into the log to explain this.
if [[ ! "$REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/+-]*$ ]] || [[ "$REF" == *..* ]]; then
  echo "::error::Rejected the OHIF ref supplied via ${SOURCE}. It must start with a letter or digit, contain only letters, digits and the characters . _ / + - and contain no '..'."
  exit 1
fi

# The grammar above constrains which characters may appear; git also constrains
# the shape. A trailing slash, a double slash, a path component starting with a
# dot, and a '.lock' suffix all pass the grammar and are still illegal refs.
# Without this, such a value reaches the checkout step and fails there with a
# git error about a missing ref, several steps away from the typo that caused
# it.
#
# `refs/heads/$REF` rather than `--branch $REF`: the latter also expands git's
# previous-branch syntax (@{-1}), which consults repository state. The grammar
# already bars '@', so that cannot arise here, but a validator that only
# validates is the simpler thing to reason about — and this form needs no
# repository at all.
if ! git check-ref-format "refs/heads/${REF}"; then
  echo "::error::Rejected the OHIF ref supplied via ${SOURCE}: git does not accept that ref name. Check for a trailing or doubled '/', a path component starting with '.', or a '.lock' suffix."
  exit 1
fi

echo "::notice::OHIF ref (${SOURCE}): ${REF}"
echo "OHIF_REF=${REF}" >> "$GITHUB_ENV"
