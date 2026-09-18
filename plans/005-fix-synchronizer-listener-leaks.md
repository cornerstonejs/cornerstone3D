# Plan 005: Fix Synchronizer's mismatched add/removeEventListener references (two listener leaks)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b4c094e92..HEAD -- packages/tools/src/store/SynchronizerManager/Synchronizer.ts`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b4c094e92`, 2026-07-07

## Why this matters

`Synchronizer` (camera sync, VOI sync, slice sync across viewports) has two
independent listener-management bugs, both of the same species: the function
reference passed to `removeEventListener` is not the one passed to
`addEventListener`, so removal silently no-ops.

1. **Main/auxiliary events**: `addSource` registers `this._onEvent.bind(this)`
   (a fresh function per call), but `removeSource`/`removeTarget` remove
   `this._eventHandler` — a *completely different function* (the sync callback
   given to the constructor). Two `@ts-ignore` comments at the removal sites
   are suppressing exactly the type error that would have caught this.
2. **ELEMENT_DISABLED auto-cleanup**: `_updateDisableHandlers` creates a new
   `disableHandler` closure on every call and does remove-then-add with it;
   the remove never matches the previously-added closure, so handlers
   accumulate unboundedly (one per add/remove of any source/target). Worse,
   the handler passes a raw DOM element into `remove(...)`, which expects a
   `{ renderingEngineId, viewportId }` object, so it also never actually
   removes the viewport.

Net effect: every viewport that ever participated in a synchronizer keeps its
listeners for the life of the page; disabled viewports keep firing into
synchronizers; each layout change stacks more handlers. Note that
`packages/tools/src/store/removeEnabledElement.ts:82-84` independently calls
`synchronizer.remove(...)` with a proper viewport-info object — that working
path is why these bugs have gone unnoticed, and it must keep working.

## Current state

- `packages/tools/src/store/SynchronizerManager/Synchronizer.ts` — the whole class (~400 lines). Key members:
  - `_eventHandler: ISynchronizerEventHandler` — constructor-provided sync callback (line 38, set at 55). NOT a DOM listener.
  - `_onEvent = (evt: Event): void => {...}` — arrow-field DOM listener (line 307); calls `_eventHandler` internally (line 280).
  - `getEventSource(viewportInfo): EventTarget` (line 381) — resolves element vs global `eventTarget`.

Bug 1 — add side (`Synchronizer.ts:133-139`):

```ts
    eventSource.addEventListener(this._eventName, this._onEvent.bind(this));

    // Use a default source of 'element' if not provided just like we do for the main event.
    this._auxiliaryEvents.forEach(({ name, source = 'element' }) => {
      const target = source === 'element' ? viewport.element : eventTarget;
      target.addEventListener(name, this._onEvent.bind(this));
    });
```

Bug 1 — remove side (`Synchronizer.ts:203-218`, inside `removeSource`; a
similar block exists in `removeTarget` — find it):

```ts
    //@ts-ignore
    eventSource.removeEventListener(this._eventName, this._eventHandler);

    this._auxiliaryEvents.forEach(({ name, source }) => {
      const target =
        source === 'element'
          ? this.getViewportElement(viewportInfo)
          : eventTarget;
      //@ts-ignore
      target.removeEventListener(name, this._eventHandler);
    });
```

Bug 2 (`Synchronizer.ts:352-377`):

```ts
  private _updateDisableHandlers(): void {
    const viewports = _getUniqueViewports(
      this._sourceViewports,
      this._targetViewports
    );
    const _remove = this.remove.bind(this);
    const disableHandler = (elementDisabledEvent) => {
      _remove(elementDisabledEvent.detail.element);
    };

    viewports.forEach((vp) => {
      const eventSource = this.getEventSource(vp);

      if (!eventSource) {
        return;
      }

      eventSource.removeEventListener(
        Enums.Events.ELEMENT_DISABLED,
        disableHandler
      );
      eventSource.addEventListener(
        Enums.Events.ELEMENT_DISABLED,
        disableHandler
      );
    });
  }
```

Key fact for the fix: `_onEvent` is ALREADY an identity-stable arrow-function
class field (line 307). The `.bind(this)` calls at the add sites are
unnecessary — `this._onEvent` itself is the stable reference to use on both
sides.

Repo conventions: TypeScript, prettier, arrow-function class fields for
listeners. Jest tests: `packages/tools/jest.config.js` picks up
`packages/tools/**/*.jest.js` AND `src/**/*.spec.ts`; `@cornerstonejs/core`
is module-mapped to core's `src`, so importing core in tests works.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Build core then tools | `pnpm --filter @cornerstonejs/core run build:esm && pnpm --filter @cornerstonejs/tools run build:esm` | exit 0 |
| Unit test (this fix) | `pnpm run test:unit:no-coverage -- Synchronizer` | new tests pass |
| Lint | `pnpm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `packages/tools/src/store/SynchronizerManager/Synchronizer.ts`
- `packages/tools/test/Synchronizer_listeners.jest.js` (create)

**Out of scope** (do NOT touch, even though they look related):
- `packages/tools/src/store/removeEnabledElement.ts` — its `synchronizer.remove(enabledElement)` call is correct and must keep working unchanged.
- `SynchronizerManager/createSynchronizer.ts`, `destroy.ts`, and the synchronizer factory functions in `packages/tools/src/synchronizers/` — behavior consumers, not part of the bug.
- The `fireEvent` / `_ignoreFiredEvents` loop-prevention logic — intentional, leave alone.

## Git workflow

- Branch: `advisor/005-fix-synchronizer-listener-leaks`
- Commit message style: `fix(tools): remove the same listener references Synchronizer adds`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Use the stable `_onEvent` reference on both add and remove sides

- In `addSource` (and check `addTarget` — read it; at this commit only
  `addSource` attaches listeners, but verify): replace both
  `this._onEvent.bind(this)` occurrences with `this._onEvent`.
- In `removeSource` AND `removeTarget`: replace both
  `this._eventHandler` occurrences in `removeEventListener` calls with
  `this._onEvent`, and delete the now-unneeded `//@ts-ignore` comments above
  them. If the `@ts-ignore` was ALSO masking an EventTarget-signature
  complaint (it may be, since `_onEvent` takes `Event`), fix the typing
  properly (e.g. `this._onEvent as EventListener`) rather than re-adding
  `@ts-ignore`.
- In `removeSource`/`removeTarget`, the auxiliary-events removal uses
  `source === 'element'` without the `= 'element'` default that the add side
  uses (`{ name, source = 'element' }`). Make the default consistent on the
  remove side too, otherwise an auxiliary event declared without `source`
  is added to the element but removed from `eventTarget`.

**Verify**: `pnpm --filter @cornerstonejs/tools run build:esm` → exit 0, and
`grep -c '@ts-ignore' packages/tools/src/store/SynchronizerManager/Synchronizer.ts` → 0.

### Step 2: Make the disable handler identity-stable and pass the right argument

Replace the per-call closure with a class field (place near `_onEvent`):

```ts
  private _disableHandler = (elementDisabledEvent) => {
    const { element } = elementDisabledEvent.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return;
    }
    const { viewportId, renderingEngineId } = enabledElement;
    this.remove({ viewportId, renderingEngineId });
  };
```

Caveat: by the time `ELEMENT_DISABLED` fires, `getEnabledElement(element)` may
already return `undefined` (the element is being torn down). Read the event's
payload first: `grep -rn "ELEMENT_DISABLED" packages/core/src/RenderingEngine/BaseRenderingEngine.ts packages/core/src/RenderingEngine/*.ts | head` and find
where the event detail is constructed — if the detail already carries
`viewportId` / `renderingEngineId` (it typically does), prefer reading them
directly from `elementDisabledEvent.detail` and fall back to
`getEnabledElement` only if absent. `getEnabledElement` is already imported at
the top of Synchronizer.ts.

Then in `_updateDisableHandlers`, delete the local `_remove`/`disableHandler`
declarations and use `this._disableHandler` in both the remove and add calls.
The remove-then-add idiom now correctly dedupes (adding the same reference
twice is a no-op per DOM spec, but keep the explicit remove for clarity).

**Verify**: `pnpm --filter @cornerstonejs/tools run build:esm` → exit 0.

### Step 3: Regression tests

Create `packages/tools/test/Synchronizer_listeners.jest.js` (model imports on
an existing `packages/tools/test/*.jest.js` file — list the directory first).
The Synchronizer can be constructed directly: `new Synchronizer(id, eventName,
handlerFn, options)` — but it resolves viewports via
`getEnabledElementByViewportId`/`getRenderingEngine`, so the cleanest jest
approach is to test the listener bookkeeping with the global `eventTarget`
source: construct with `options = { eventSource: 'eventTarget' }`, spy on
`eventTarget.addEventListener` / `removeEventListener` (import `eventTarget`
from `@cornerstonejs/core`), and stub `getEnabledElementByViewportId` — if
that import proves unstubbable, use jest module mocking for
`@cornerstonejs/core` with the real module spread plus overridden lookup
functions.

Cases:
1. After `addSource(vpInfo)` then `removeSource(vpInfo)`: every
   `removeEventListener` call received the **same function reference** as a
   prior `addEventListener` call for the same event name (assert
   `removeSpy.mock.calls` references are all present in
   `addSpy.mock.calls` references).
2. Auxiliary event without an explicit `source`: added and removed on the
   same target.
3. Calling `addSource` twice then `removeSource` twice does not leave the
   `ELEMENT_DISABLED` listener count growing (assert add/remove call counts
   for `ELEMENT_DISABLED` balance out to ≤ 1 net listener).

**Verify**: `pnpm run test:unit:no-coverage -- Synchronizer` → new tests pass.

## Test plan

Covered in Step 3. The identity assertions (same-reference add/remove) are the
regression guard for both bugs; they fail on the current code.

## Done criteria

- [ ] `grep -n '_onEvent.bind' packages/tools/src/store/SynchronizerManager/Synchronizer.ts` returns no matches
- [ ] `grep -n 'removeEventListener' packages/tools/src/store/SynchronizerManager/Synchronizer.ts` shows only `this._onEvent` / `this._disableHandler` references
- [ ] `grep -c '@ts-ignore' packages/tools/src/store/SynchronizerManager/Synchronizer.ts` → 0
- [ ] `pnpm --filter @cornerstonejs/tools run build:esm` exits 0
- [ ] `pnpm run test:unit:no-coverage -- Synchronizer` passes with the new tests
- [ ] `pnpm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts no longer match the live file (drift).
- Existing tests fail after Step 1 in a way that suggests something *depended*
  on listeners surviving `removeSource` (i.e. sync still firing after removal).
- The `ELEMENT_DISABLED` event detail contains neither element nor
  viewportId/renderingEngineId — the payload assumption is wrong.
- Stubbing core lookups in jest requires modifying production code.

## Maintenance notes

- Reviewer: check `removeTarget` got the same treatment as `removeSource`, and that the auxiliary-event `source` default is now symmetric.
- Behavior change to be aware of: disabled viewports will now actually stop receiving/driving sync events (previously they kept syncing via the leaked listener). If any downstream app accidentally relied on that, it surfaces as "sync stops after re-layout" — expected and correct.
- Deferred: `_updateDisableHandlers` is called from add/remove but never removes handlers from viewports that left the set; with the stable reference this is now a bounded no-op, but a cleaner design would track per-viewport disable listeners explicitly.
