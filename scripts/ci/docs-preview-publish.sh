#!/usr/bin/env bash
# Publishes a built documentation directory to Netlify as the preview of one
# pull request, then reports the two links in three places: the job summary, a
# comment on the pull request, and a commit status.
#
# Two workflows call this script, and the split between them is deliberate:
#
#   docusaurus-build.yml   a pull request of this repository. That workflow
#                          builds and publishes in one run, so the author sees
#                          the preview without a second run.
#   docs-preview-deploy.yml  a fork pull request. A fork run reaches no secret,
#                          so a second workflow publishes the artifact of the
#                          first one.
#
# The script exists so that one implementation serves both. A change here
# changes both paths at once.
#
# Required env:
#   NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID   the Netlify credentials
#   PUBLISH_DIR                           absolute path of the built site
#   PR_NUMBER                             the pull request, digits only
#   HEAD_SHA                              the head commit of the pull request
#   GH_TOKEN                              a token that can write a comment and
#                                         a status
#   GITHUB_REPOSITORY                     owner/repo
# Optional env:
#   GITHUB_STEP_SUMMARY                   the summary file, when GitHub sets it
#   NETLIFY_CLI_VERSION                   default 27.5.2
#
# Exit status: the deploy decides it. A report that fails writes a warning and
# does not change the exit status, because a preview that exists and a comment
# that is absent is a better result than a run that reports failure and hides a
# working preview.

set -euo pipefail

NETLIFY_CLI_VERSION="${NETLIFY_CLI_VERSION:-27.5.2}"
MARKER='<!-- cs3d-docs-preview -->'

# PR_NUMBER reaches the alias and two API paths below. A fork controls the name
# of its branch, and docs-preview-deploy.yml derives PR_NUMBER from that branch
# through the API, so the value is checked here as well as there. One check in
# the place that uses the value is worth more than one in the place that found
# it.
if [[ ! "${PR_NUMBER:-}" =~ ^[0-9]+$ ]]; then
  echo "::error::PR_NUMBER is not a number: '${PR_NUMBER:-}'"
  exit 1
fi

if [ ! -f "${PUBLISH_DIR}/index.html" ]; then
  echo "::error::${PUBLISH_DIR}/index.html is absent, so there is no site to publish."
  exit 1
fi

# --no-build stops netlify-cli from running a build command of the site. The
# flag keeps the production deploy correct in build-docs.yml, and here it also
# keeps the fork path safe: this script must upload the files of a fork and must
# never run them.
#
# --alias replaces --prod and puts the deploy on its own hostname. The alias is
# the number of the pull request, so a later push replaces the preview of that
# pull request instead of adding a second one.
echo "Deploying ${PUBLISH_DIR} as the preview of pull request #${PR_NUMBER}."
RESULT=$(npx -y "netlify-cli@${NETLIFY_CLI_VERSION}" deploy \
  --no-build \
  --dir="${PUBLISH_DIR}" \
  --alias="pr-${PR_NUMBER}" \
  --json)

URL=$(jq -r '.deploy_url' <<<"$RESULT")
if [[ -z "$URL" || "$URL" == "null" ]]; then
  echo "::error::The Netlify deploy returned no URL."
  echo "$RESULT"
  exit 1
fi

echo "::notice::The preview of pull request #${PR_NUMBER} is at ${URL}"
echo "url=${URL}" >>"${GITHUB_OUTPUT:-/dev/null}"

# Everything below reports. A failure past this point writes a warning and
# leaves the exit status at zero.
set +e

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## Preview"
    echo
    echo "| Target | URL |"
    echo "| --- | --- |"
    echo "| Documentation | ${URL} |"
    echo "| Examples | ${URL}/live-examples/ |"
  } >>"$GITHUB_STEP_SUMMARY"
fi

BODY=$(printf '%s\n### Documentation preview for %s\n\n| Target | URL |\n| --- | --- |\n| Documentation | %s |\n| Examples | %s/live-examples/ |\n' \
  "$MARKER" "${HEAD_SHA:0:7}" "$URL" "$URL")

# `.body // ""` is not cosmetic: a comment whose body is null makes startswith
# fail, and the failure would otherwise end the search and add a second comment
# on every later push.
COMMENT_ID=$(gh api --paginate \
  "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
  --jq "[.[] | select((.body // \"\") | startswith(\"$MARKER\")) | .id] | first // empty" \
  | head -n 1)

if [ -n "$COMMENT_ID" ]; then
  gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${COMMENT_ID}" -f body="$BODY" >/dev/null \
    || echo "::warning::The script could not edit comment ${COMMENT_ID}."
else
  gh api -X POST "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" -f body="$BODY" >/dev/null \
    || echo "::warning::The script could not add a comment to pull request #${PR_NUMBER}."
fi

# The status attaches to the head commit. A status on the merge commit that a
# pull_request event supplies does not appear on the pull request.
gh api -X POST "repos/${GITHUB_REPOSITORY}/statuses/${HEAD_SHA}" \
  -f state=success \
  -f context='preview/docs' \
  -f description='The documentation and the examples preview' \
  -f target_url="$URL" >/dev/null \
  || echo "::warning::The script could not add the status to commit ${HEAD_SHA}."

exit 0
