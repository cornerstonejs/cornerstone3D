# Plan 006: Remove VolumeCroppingTool's leaked global eventTarget listener on disable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/tools/src/tools/VolumeCroppingTool.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

`VolumeCroppingTool` listens on the **global** `eventTarget` for
`VOLUMECROPPINGCONTROL_TOOL_CHANGED` using an anonymous arrow function, and
never stores the reference. `onSetToolDisabled` cleans up resize observers and
another listener but cannot remove this one. Every activation/setup cycle adds
another permanent global listener holding a closure over the tool instance:
control-tool changes get handled N times, and old tool instances can never be
garbage collected.

## Current state

- `packages/tools/src/tools/VolumeCroppingTool.ts` — 3D volume-cropping tool (~1400+ lines).

The leak (`packages/tools/src/tools/VolumeCroppingTool.ts:1349-1354`, inside
the actor/clipping-plane setup method — locate it by grepping for
`VOLUMECROPPINGCONTROL_TOOL_CHANGED`):

```ts
    eventTarget.addEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      (evt) => {
        this._onControlToolChange(evt);
      }
    );
```

`_onControlToolChange` is ALREADY an identity-stable arrow-function class
field (`VolumeCroppingTool.ts:937`: `_onControlToolChange = (evt) => {`), so
the anonymous wrapper is pointless — the fix is to pass the field directly and
remove it on disable.

The cleanup method that must gain the removal
(`packages/tools/src/tools/VolumeCroppingTool.ts:362-379`):

```ts
  onSetToolDisabled() {
    // Disconnect all resize observers
    this._resizeObservers.forEach((resizeObserver, viewportId) => {
      resizeObserver.disconnect();
      this._resizeObservers.delete(viewportId);
    });

    if (this._viewportAddedListener) {
      eventTarget.removeEventListener(
        Events.TOOLGROUP_VIEWPORT_ADDED,
        this._viewportAddedListener
      );
      this._viewportAddedListener = null; // Clear the reference to the listener
    }

    const viewportsInfo = this._getViewportsInfo();
    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
  }
```

The `_viewportAddedListener` block above is the exemplar pattern to match.

Beware: the setup method containing the `addEventListener` may run once per
viewport/volume initialization, so even with a stable reference you can add
the listener multiple times — DOM `addEventListener` dedupes identical
(type, listener) pairs on real EventTargets, and cornerstone's `eventTarget`
(`packages/core/src/eventTarget.ts`) is a CustomEventTarget — check whether
its `addEventListener` dedupes; if it does not, guard with a boolean or
remove-before-add.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Build tools | `pnpm --filter @cornerstonejs/tools run build:esm` | exit 0 |
| Unit tests | `pnpm run test:unit:no-coverage` | all pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/tools/src/tools/VolumeCroppingTool.ts`

**Out of scope** (do NOT touch, even though they look related):
- `packages/tools/src/tools/VolumeCroppingControlTool.ts` (the counterpart tool) — audit it separately if desired; not this plan.
- The resize-observer and sphere/actor logic in the same file.
- `packages/core/src/eventTarget.ts` — read-only reference for dedupe semantics.

## Git workflow

- Branch: `advisor/006-fix-volumecropping-listener-leak`
- Commit message style: `fix(tools): remove VolumeCroppingTool control-change listener on disable`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Register the stable reference instead of an anonymous wrapper

At the add site, replace the anonymous arrow with the existing class field,
using remove-before-add to stay idempotent regardless of CustomEventTarget
dedupe semantics:

```ts
    eventTarget.removeEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      this._onControlToolChange
    );
    eventTarget.addEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      this._onControlToolChange
    );
```

**Verify**: `pnpm --filter @cornerstonejs/tools run build:esm` → exit 0.

### Step 2: Remove it on disable

In `onSetToolDisabled`, after the `_viewportAddedListener` block, add:

```ts
    eventTarget.removeEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      this._onControlToolChange
    );
```

**Verify**: `pnpm --filter @cornerstonejs/tools run build:esm` → exit 0, then
`pnpm run test:unit:no-coverage` → all pass, `pnpm run lint` → exit 0.

## Test plan

No existing unit scaffolding constructs this tool (it needs vtk actors). Do
not build one. Verification: build + suite + the two greps in Done criteria.
Optional manual check if the operator asks: run the `volumeCroppingTool`
example (`pnpm run example volumeCropping` — find the exact example name with
`ls utils/ExampleRunner` guidance or `grep -ril volumecropping packages/tools/examples`) and confirm dragging control spheres still updates cropping planes.

## Done criteria

- [ ] `grep -n "_onControlToolChange(evt)" packages/tools/src/tools/VolumeCroppingTool.ts` shows no anonymous-wrapper registration (only the class-field definition and direct references remain)
- [ ] `grep -c "removeEventListener(\s*$" packages/tools/src/tools/VolumeCroppingTool.ts` — manual check: `onSetToolDisabled` contains a `VOLUMECROPPINGCONTROL_TOOL_CHANGED` removal
- [ ] `pnpm --filter @cornerstonejs/tools run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage` passes
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The add site or `onSetToolDisabled` no longer match the excerpts (drift).
- `_onControlToolChange` is no longer an arrow-function class field (identity would not be stable and the plan's core assumption fails).
- The setup method intentionally registers per-viewport distinct handlers (evidence: the closure uses per-viewport state beyond `this`) — it does not at this commit, but verify.

## Maintenance notes

- Reviewer: check idempotency — enable → disable → enable must end with exactly one live listener.
- Sibling cleanup opportunity (deferred, separate finding): `OrientationControllerTool` has untracked `setTimeout`s that outlive disable (`OrientationControllerTool.ts:252-255,363-366,433-446`); same review lens, different mechanism.
