# Plan 004: Fix VideoViewport's unbound ELEMENT_DISABLED handler so teardown actually runs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/core/src/RenderingEngine/VideoViewport.ts`
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

`VideoViewport` registers `this.elementDisabledHandler` as a DOM event
listener without binding it. When `ELEMENT_DISABLED` fires, `this` inside the
handler is the **canvas element**, not the viewport, so
`this.removeEventListeners()` is `undefined` and the handler throws. The
consequences: the listener is never removed, the `<video>` element is never
removed from the DOM, and the video keeps decoding (and potentially fetching)
in the background after the viewport is disabled — a listener, DOM, and
network/CPU resource leak on every video viewport teardown.

## Current state

- `packages/core/src/RenderingEngine/VideoViewport.ts` — video viewport; the constructor calls `this.addEventListeners()` at line 143.

The buggy trio (`packages/core/src/RenderingEngine/VideoViewport.ts:151-168`):

```ts
  private addEventListeners() {
    this.canvas.addEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private removeEventListeners() {
    this.canvas.removeEventListener(
      EVENTS.ELEMENT_DISABLED,
      this.elementDisabledHandler
    );
  }

  private elementDisabledHandler() {
    this.removeEventListeners();
    this.videoElement.remove();
  }
```

`elementDisabledHandler` is a plain method — passed as a listener it loses
`this`. The repo's established convention for this exact situation is arrow-
function class fields; the same file already uses one elsewhere and so does
`packages/tools/src/store/SynchronizerManager/Synchronizer.ts:307`
(`private _onEvent = (evt: Event): void => {...}`). Match that convention.

Also note the viewport has a `pause()` method (search `public async pause` in
the same file) — teardown should pause the video before removing it so the
media element stops decoding immediately.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Typecheck/build core | `pnpm --filter @cornerstonejs/core run build:esm` | exit 0 |
| Unit tests | `pnpm run test:unit:no-coverage` | all pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/core/src/RenderingEngine/VideoViewport.ts` (only `elementDisabledHandler` and, if needed, its two call sites in `addEventListeners`/`removeEventListeners`)

**Out of scope** (do NOT touch, even though they look related):
- The `seeked` listener add/remove pairs later in the file (lines ~370–430) — they use locally-scoped named functions and are correct.
- `VideoViewport`'s public API and the `EVENTS.ELEMENT_DISABLED` dispatch site.
- Whether the disabled event should be listened for on `this.canvas` vs `this.element` — leave the target as-is.

## Git workflow

- Branch: `advisor/004-fix-videoviewport-disabled-handler`
- Commit message style: `fix(core): bind VideoViewport elementDisabledHandler so video teardown runs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Convert the handler to an arrow-function class field and pause the video

Replace the method with a class-field arrow function (keep it `private`, keep
the same name so `addEventListeners`/`removeEventListeners` are unchanged):

```ts
  private elementDisabledHandler = () => {
    this.pause();
    this.removeEventListeners();
    this.videoElement?.remove();
  };
```

Check `pause()`'s signature first: if it is async, calling it without await
here is fine (fire-and-forget teardown), but if it can throw synchronously
when no video is loaded, guard with `this.videoElement &&` or a try/catch —
read the method body and pick the minimal safe form.

Class-field ordering: TypeScript initializes fields in declaration order
against the constructor; since the handler only runs on events (never during
construction), placing the field where the method currently sits is fine.

**Verify**: `pnpm --filter @cornerstonejs/core run build:esm` → exit 0.

### Step 2: Full unit suite

**Verify**: `pnpm run test:unit:no-coverage` → all pass. Also `pnpm run lint` → exit 0.

## Test plan

No practical jest coverage exists for VideoViewport (it needs a real
`<video>`/canvas stack); do not build one for this fix. Verification is
build + suite + the mechanical nature of the change. If a karma test file for
video viewports exists (`ls packages/core/test | grep -i video`), read it and
add an assertion there only if it already constructs a VideoViewport.

## Done criteria

- [ ] `grep -n "private elementDisabledHandler = () =>" packages/core/src/RenderingEngine/VideoViewport.ts` matches
- [ ] `pnpm --filter @cornerstonejs/core run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage` passes
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpt no longer matches (drift).
- `pause()` does not exist on the class (search `pause` in the file) — then just bind the handler without the pause call and note it.
- The build surfaces a field-initialization-order error (would indicate the class relies on method hoisting elsewhere).

## Maintenance notes

- Reviewer: confirm the handler is a class field (identity-stable), since `removeEventListeners` removes by reference.
- The same unbound-method-as-listener pattern is worth grepping for in future reviews: `addEventListener(\n?.*this\.[a-zA-Z]+Handler\b` where the handler is declared as a plain method.
