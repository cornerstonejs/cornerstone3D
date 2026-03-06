# OHIF integration builds — how to run

This repo publishes npm tarballs to **GitHub Releases** for OHIF (and other consumers) to use before an official npm publish. Two workflows drive this.

## When do builds run?

1. **Pull request (integration build)**  
   When a PR has the **`ohif-integration`** label:
   - The workflow runs on the PR head commit.
   - It builds all publishable packages, creates `.tgz` tarballs, and creates/updates a **prerelease** tag:  
     `cs3d-pr-<PR number>-<short SHA>` (e.g. `cs3d-pr-123-a1b2c3d`).
   - All tarballs are uploaded as **release assets** (not Actions artifacts).
   - A **repository_dispatch** event is sent to the OHIF repo (if configured) so OHIF can run integration tests against this build.

2. **Push to `main` (merged refresh)**  
   On every push to `main`:
   - Same build and tarball steps.
   - Creates/updates a prerelease tag: **`cs3d-merged-v<version>`** (version from `lerna.json`).
   - Dispatches to OHIF with `mode: merged-refresh` so OHIF can refresh its “merged” integration baseline.

## How to run an integration build for a PR

1. Open your PR as usual.
2. Add the label **`ohif-integration`** to the PR.
3. The workflow **CS3D PR integration build** will run (on push to the PR or when the label is added).
4. When it finishes, the prerelease appears under [Releases](https://github.com/cornerstonejs/cornerstone3D/releases). Download the `.tgz` assets from there, or use the release tag in OHIF (see below).

Reruns are **idempotent**: running the workflow again replaces the existing release and assets for that tag.

## Required configuration

- **Secrets (repository or org)**  
  - **`CS3D_TO_OHIF_APP_TOKEN`**  
    A GitHub PAT (or app token) with permission to trigger workflows in the OHIF repo. Used to send `repository_dispatch`. If unset, the workflow still runs but skips the dispatch step.
  - **OHIF repo**  
    Set **`OHIF_INTEGRATION_REPO`** as a **variable** or **secret** to the full repo name (e.g. `OHIF/Viewers`). If unset, dispatch is skipped.

- **Label**  
  The PR workflow runs only when the PR has the label **`ohif-integration`**. Create this label in the repo if it does not exist.

## Creating tarballs locally

To build the same set of tarballs that CI uploads:

```bash
# From the repo root
bun install --frozen-lockfile   # or yarn install
bun run build
RELEASE_TARBALLS_DIR=release-tarballs node scripts/create-release-tarballs.js
```

Tarballs are written to `release-tarballs/` (or the directory you set in `RELEASE_TARBALLS_DIR`). Only the packages listed in `lerna.json` are packed (no addOns).

## Dispatch payload to OHIF

The workflows send a **repository_dispatch** event to the OHIF repo.

- **Event type:** `cs3d-integration`
- **Payload (PR, `integration-only`):**  
  `mode`, `cs3d_pr_number`, `cs3d_head_sha`, `release_tag`, `source_repository`
- **Payload (push to main, `merged-refresh`):**  
  `mode`, `cs3d_merged_sha`, `cs3d_merged_version`, `release_tag`, `source_repository`

OHIF can listen for `repository_dispatch` with `event_type: cs3d-integration` and use `release_tag` and `source_repository` to resolve the GitHub release and download the `.tgz` assets (e.g. via the Releases API or `gh release download`).

## Workflow files

- [.github/workflows/cs3d-pr-integration-build.yml](.github/workflows/cs3d-pr-integration-build.yml) — PR builds and prerelease.
- [.github/workflows/cs3d-post-merge-integration-update.yml](.github/workflows/cs3d-post-merge-integration-update.yml) — Post-merge builds and prerelease.
