# OHIF Downstream Validation - Failure Investigation

PR #2666 (`cornerstone3d-redo-viewports`)
Latest CI run (after pushes up to `46dfc5419`):
- Run: <https://github.com/cornerstonejs/cornerstone3D/actions/runs/26309137380>
- Result: failure in 2m25s

## TL;DR

The OHIF Downstream Validation job is **not exercising our cornerstone3D
changes**. It is failing at the "Checkout OHIF" step because the OHIF
ref pinned in this PR's body (`ohif_ref: feat/use-beta-5.0-cs3d`) no
longer exists on the upstream `OHIF/Viewers` repository, so the
`actions/checkout` step bails before any cs3d-vs-OHIF integration code
runs.

This means the user's premise — "we have compat and next behind a flag,
so theoretically the tests should not fail" — is correct. Our refactor
is not at fault here. The CI status is red for an infrastructure reason
that is upstream of any cornerstone3D code path.

## What runs vs. what failed

The workflow ([`.github/workflows/ohif-downstream.yml`](../.github/workflows/ohif-downstream.yml))
has the following steps:

1. `Checkout Cornerstone` (this PR) — succeeded
2. `Resolve OHIF ref` — succeeded; produced `OHIF_REF=feat/use-beta-5.0-cs3d`
3. `Set up Bun` / `Set up Node` — succeeded
4. `Install Cornerstone dependencies` — succeeded (bun install --frozen-lockfile)
5. `Build local Cornerstone packages for OHIF` — succeeded (`bun run build:esm`)
6. **`Checkout OHIF` — failed** before any code ran:
   ```
   /usr/bin/git fetch ... +refs/heads/feat/use-beta-5.0-cs3d*:...
   The process '/usr/bin/git' failed with exit code 1
   ```
   The fetch is retried 3 times with backoff, all fail. Job exits.

OHIF unit tests, OHIF e2e tests, and the cornerstone-side linker
(`scripts/link-ohif-cornerstone-node-modules.mjs`) never ran. Whatever
behavior changes are gated behind `?type=next` / `useViewportNext` /
`ViewportType.PLANAR_NEXT` were not exercised in this CI run.

## Why the OHIF ref resolved to a missing branch

`scripts/ci/ohif-ref-resolve.sh` reads the PR body for a
`OHIF_REF:` / `ohif_ref:` line:

```
ohif_ref: feat/use-beta-5.0-cs3d
```

That line is at the top of PR #2666's body. The resolver picks it up
verbatim and exports `OHIF_REF=feat/use-beta-5.0-cs3d` into the
workflow's environment.

`git ls-remote https://github.com/OHIF/Viewers` confirms the branch
does **not** exist on `OHIF/Viewers`:

- `refs/heads/feat/cs3d-3.31.0` — yes (old CS3D 3.31 integration)
- `refs/heads/feat/cs3d-3.31.4` — yes
- `refs/heads/feat/cs3d-new-synchronizers` — yes
- `refs/heads/fix/cs3d-3.0-compatibility` — yes
- `refs/heads/fix/cs3d-combined-integration` — yes
- `refs/heads/fix/move-to-next-beta` — yes
- `refs/heads/beta` — yes
- `refs/heads/feat/use-beta-5.0-cs3d` — **no**

It was likely renamed, merged into another branch, or deleted on the
OHIF side. The PR body still points at the old name.

## Historical context: was the integration ever passing?

The previous full-length OHIF runs on this branch (May 12-13, ~15-23
minutes each) reached the OHIF e2e stage and **also failed**, but for a
completely different reason — OHIF's own webpack dev server refused to
start:

```
[WebServer] @ohif/app: [webpack-cli] Invalid configuration object.
  - configuration.watchOptions.ignored should be one of these:
    [non-empty string, ...] | RegExp | non-empty string
```

That is an OHIF-side dependency-mismatch problem (likely a webpack
major upgrade in the OHIF integration branch that hadn't yet updated
the `watchOptions.ignored` shape). It is, again, unrelated to
cornerstone3D source code.

So the OHIF downstream job has been failing for at least 9 days on this
branch, through two distinct failure modes, neither caused by changes
under our control in this repository.

## Why the compat/next flag analysis still holds

The user's mental model: legacy `StackViewport` / `VolumeViewport` /
`VideoViewport` consumers (i.e. OHIF) go through the existing code
paths unchanged. `ViewportType.PLANAR_NEXT`, `ViewportType.VIDEO_NEXT`,
etc. and the `useViewportNext` core config are opt-in. If OHIF doesn't
flip those switches, its rendering should behave exactly like
pre-refactor cornerstone3D.

A few specific reasons that holds in this branch:

- `PlanarRenderPathDecisionService` and `useViewportNext` are only
  consulted when an application explicitly sets `renderingEngineMode`
  or instantiates a `*_NEXT` viewport type. OHIF master/beta does
  neither.
- The `SegmentationStateManager` refactor (extracting
  `LabelmapImageReferenceResolver`) preserves the public API surface:
  the same `getSegmentation`, `getSegmentations`,
  `addSegmentations`, `removeSegmentation`,
  `getCurrentLabelmapImageIdForViewport`,
  `getStackSegmentationImageIdsForViewport`, etc. exports continue to
  work. Only internal field names moved into the resolver. The merge
  commit explicitly re-routes `removeSegmentation` through the
  resolver so the beta cleanup behavior is preserved.
- The `getDefaultSegmentationStateManager()` shim was restored on
  `segmentation.state` so any downstream consumer that reached for the
  singleton through the namespace still finds it.

In other words, the integration surface is intact. If the OHIF
checkout had succeeded, the most likely outcome is that the OHIF e2e
tests would have hit OHIF's own webpack-config bug (same as the May 13
run) — not a cornerstone3D regression.

## Recommended next steps

In priority order:

1. **Update the PR body's `ohif_ref`** to a branch that exists on
   `OHIF/Viewers`. Plausible candidates:
   - `master` (default) — gives the broadest validation but may not
     include the API consumers that target CS3D 5.0.
   - `beta` — matches the cs3d major we're integrating with.
   - `fix/move-to-next-beta` — looks like an OHIF-side branch already
     aimed at the next beta integration.
   Pick whichever the OHIF team currently expects to compile against
   the unreleased 5.0 viewport API.
2. **Once the checkout succeeds, expect to hit the webpack
   `watchOptions.ignored` issue again** until OHIF's branch is
   regenerated against a compatible webpack version. That is an OHIF
   maintainer fix, not a cornerstone3D one. Coordinate with the OHIF
   team or pin OHIF to a commit predating the bad webpack bump.
3. Optionally, make the resolver fall back to `master` (or `beta`)
   with a warning when the requested ref doesn't exist on OHIF, so the
   downstream job at least runs *something* instead of failing in the
   checkout step. The current behavior is "fail loud on a missing
   ref," which is reasonable, but a 2m25s no-signal failure is
   indistinguishable from a real cs3d regression at a glance.

## Confidence and caveats

This investigation is based on the workflow logs of run
`26309137380` (the failing 2m25s run that triggered this writeup) and
the older 15-23 minute runs from May 12-13 to establish the historical
pattern. I did **not** rerun OHIF locally with the linked packages, so
I cannot rule out that — if checkout were fixed and the webpack issue
were fixed — there would be no cornerstone3D regression. Given that
all public segmentation-state APIs are preserved, vtk.js is at the
version the branch's own examples target (35.5.3), and the only
behavior change relevant to OHIF's legacy code path is the slice-axis
snap fix (`Math.floor(d/2)` matching legacy `resetCamera`), the chance
of an unrelated regression hitting OHIF specifically is low — but it
is non-zero, and the only way to confirm is to get a clean OHIF run
through the workflow.
