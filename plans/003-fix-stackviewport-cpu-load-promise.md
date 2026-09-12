# Plan 003: Make StackViewport's CPU load promise always settle when a load is superseded by scrolling

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/core/src/RenderingEngine/StackViewport.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

On the CPU rendering path, `StackViewport.setImageIdIndex()` returns a promise
that is awaited internally and by applications. When the user scrolls to a new
image while an older image is still loading, the older load's success callback
detects it was superseded and returns early — **without resolving or rejecting
the promise**. Every `await viewport.setImageIdIndex(...)` for a superseded
load hangs forever, leaking pending promises and stalling any caller logic
chained on it (scroll loops, prefetch orchestration, app-level `await`s).

## Current state

- `packages/core/src/RenderingEngine/StackViewport.ts` — the stack viewport; CPU load path `_loadAndDisplayImageCPU` at ~lines 2140–2270; `_setImageIdIndex` at ~2759+.

The promise executor and the early return
(`packages/core/src/RenderingEngine/StackViewport.ts:2140-2157`):

```ts
  private _loadAndDisplayImageCPU(
    imageId: string,
    imageIdIndex: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // 1. Load the image using the Image Loader
      function successCallback(
        image: IImage,
        imageIdIndex: number,
        imageId: string
      ) {
        // Perform this check after the image has finished loading
        // in case the user has already scrolled away to another image.
        // In that case, do not render this image.
        if (this.currentImageIdIndex !== imageIdIndex) {
          return;
        }
```

`resolve(imageId)` is only reached at the end of `successCallback`
(`StackViewport.ts:2245`), and `reject(error)` in `errorCallback`
(`StackViewport.ts:2263`). The supersession happens because `_setImageIdIndex`
sets `this.currentImageIdIndex = imageIdIndex` **before** awaiting
(`StackViewport.ts:2765`):

```ts
    // Update the state of the viewport to the new imageIdIndex;
    this.currentImageIdIndex = imageIdIndex;
    this.hasPixelSpacing = true;
    this.viewportStatus = ViewportStatus.PRE_RENDER;
    ...
    const imageId = await this._loadAndDisplayImage(
      this.imageIds[imageIdIndex],
      imageIdIndex
    );
```

Note `_loadAndDisplayImage` (`StackViewport.ts:2131-2138`) dispatches to
`_loadAndDisplayImageCPU` or `_loadAndDisplayImageGPU` based on
`this.useCPURendering`. **Check the GPU path too**: read
`_loadAndDisplayImageGPU` and, if it contains the same
early-return-without-resolve pattern, apply the identical fix there (same
in-scope file).

Repo conventions: TypeScript, prettier. Jest tests in
`packages/core/test/*.jest.js`; there is an existing StackViewport jest test
(`packages/core/test/stackViewport_node_render.jest.js`) to use as scaffolding
reference for constructing a viewport in tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Typecheck/build core | `pnpm --filter @cornerstonejs/core run build:esm` | exit 0 |
| Unit test | `pnpm run test:unit:no-coverage -- stackViewport` | all pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/RenderingEngine/StackViewport.ts` (only `_loadAndDisplayImageCPU`, and `_loadAndDisplayImageGPU` if it has the same pattern)
- `packages/core/test/stackViewport_supersededLoad.jest.js` (create — only if viewport scaffolding from the existing node-render test makes this feasible; see Test plan)

**Out of scope** (do NOT touch, even though they look related):
- `_setImageIdIndex`'s ordering (setting `currentImageIdIndex` before awaiting is intentional — it is what makes supersession detectable). Do not "fix" by reordering; that changes scroll semantics.
- The render/CPU fallback pipeline invoked inside `successCallback`.
- `packages/core/src/RenderingEngine/helpers/cpuFallback/**`.

## Git workflow

- Branch: `advisor/003-fix-stackviewport-cpu-load-promise`
- Commit message style: `fix(core): resolve superseded StackViewport CPU image loads instead of hanging`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Settle the promise in the superseded branch

In `successCallback` inside `_loadAndDisplayImageCPU`, change:

```ts
        if (this.currentImageIdIndex !== imageIdIndex) {
          return;
        }
```

to resolve with the imageId that WAS requested (callers get a settled promise;
resolving — not rejecting — is the right call because supersession is normal
behavior during scrolling, not an error):

```ts
        if (this.currentImageIdIndex !== imageIdIndex) {
          resolve(imageId);
          return;
        }
```

`resolve` is in scope: `successCallback` is a `function` declaration inside the
`new Promise((resolve, reject) => { ... })` executor, and it is invoked with
`.call(this, ...)` so `this` remains the viewport.

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm` → exit 0.

### Step 2: Check and, if needed, fix the GPU path

Read `_loadAndDisplayImageGPU` in the same file. If its success callback has
the same `if (this.currentImageIdIndex !== imageIdIndex) { return; }` guard
inside a promise executor without settling, apply the same one-line fix.
If the GPU path uses a different mechanism (no unsettled early return), leave
it untouched and note that in your report.

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm` → exit 0.

### Step 3: Confirm no existing test depended on the hang

**Verify**: `pnpm run test:unit:no-coverage -- stackViewport` → all pass.

## Test plan

Ideal test (attempt it, but see the escape hatch): in
`packages/core/test/stackViewport_supersededLoad.jest.js`, scaffold a stack
viewport following `packages/core/test/stackViewport_node_render.jest.js`,
register a fake image loader with controllable resolution timing, call
`setImageIdIndex(0)` (don't await), immediately call `setImageIdIndex(1)`,
then resolve both fake loads and assert the first promise settles (use
`Promise.race([firstPromise, timeout(2000)])` and assert the race is won by
the promise, not the timeout).

Escape hatch: if the existing node-render scaffolding cannot force the CPU
path (`useCPURendering`) in jest, skip the new test file, rely on Step 3's
suite, and state in your report that the fix is verified by build + review
only. Do not invent a canvas/WebGL mock stack for this.

## Done criteria

- [ ] In `_loadAndDisplayImageCPU`, the superseded branch contains `resolve(imageId);` before `return;`
- [ ] `pnpm --filter @cornerstonejs/core run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage -- stackViewport` passes
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpt no longer matches (drift).
- `resolve` is NOT lexically in scope at the early-return site (would mean the promise structure changed).
- You find call sites that intentionally rely on the promise never settling for superseded loads (search for comments near `setImageIdIndex` awaits in `packages/core/src` and `packages/tools/src`).

## Maintenance notes

- Reviewer: the choice to `resolve` (vs reject with a cancellation sentinel) means callers cannot distinguish "rendered" from "superseded" by the promise alone; they can compare `viewport.getCurrentImageId()` if they care. If a future caller needs the distinction, introduce a typed `SupersededError` — deferred deliberately.
- If the GPU path has the same bug and was fixed in Step 2, mention both sites in the PR description.
