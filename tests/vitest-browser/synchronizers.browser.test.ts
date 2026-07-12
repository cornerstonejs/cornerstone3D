// State-based tests pinning the `@cornerstonejs/tools` synchronizer contracts
// (`createZoomPanSynchronizer`, `createVOISynchronizer`,
// `createImageSliceSynchronizer`, `createCameraPositionSynchronizer`, plus
// the `SynchronizerManager`/`Synchronizer` API surface) as pure cross-viewport
// state equality on GenericViewports (`PlanarViewport`, `ViewportType.PLANAR_NEXT`).
//
// Black-box rule: assertions only ever touch public `@cornerstonejs/tools` and
// `@cornerstonejs/core` exports, DOM state, and events -- never
// `packages/tools/src/**` / `packages/core/src/**` deep imports. Reading
// source (done ahead of writing this file) informed HOW the callbacks behave
// so genuine engine bugs could be pinned precisely; it is not used to assert
// against private state here.
//
// Two (or three) independent PlanarViewport contexts are used per test: `a`
// comes from the frozen harness's `createPlanarViewport()` (owns the fake
// image loader + metadata provider + `useGenericViewport` config flag and
// their teardown); `b`/`c` are attached via the local `attachSharedViewport`
// helper below, which mounts the SAME `displaySetId` (and therefore the same
// imageIds / FrameOfReferenceUID) that `a` already registered, mirroring the
// proven "cross-viewport reference" pattern in
// planarInvariants.browser.test.ts. This -- rather than each viewport
// registering its own independent fake stack -- is what the plan calls "SAME
// fake stack registration so they share frameOfReferenceUID", and it matters
// beyond just the FrameOfReferenceUID match: the CameraPosition synchronizer
// copies a `ViewReference` whose `dataId` must resolve to a mounted display
// set on the TARGET viewport too, which only holds when the id is literally
// shared.
//
// `attachSharedViewport` ALSO deliberately reuses `a`'s own RenderingEngine
// instance rather than creating a second one (multiple viewports on one
// engine, the common single-engine multi-viewport app topology -- e.g. a
// layout grid). This turned out to be load-bearing, not just convenient: the
// tools-side callbacks for both `createZoomPanSynchronizer`
// (packages/tools/src/synchronizers/callbacks/zoomPanSyncCallback.ts) and
// `createImageSliceSynchronizer`
// (packages/tools/src/synchronizers/callbacks/imageSliceSyncCallback.ts)
// resolve the SOURCE viewport via
// `getRenderingEngine(targetViewport.renderingEngineId).getViewport(sourceViewport.viewportId)`
// -- i.e. they look up the source viewport's id inside the TARGET's
// rendering engine, silently returning `undefined` (and then throwing on the
// next property access) whenever source and target live on different
// engines. This is a genuine, separate engine-topology requirement/bug
// documented in the tests below; using one shared engine here isolates the
// synchronizer contract tests from it so the other, GenericViewport-specific
// findings (documented per-test) are not masked by it.
import { afterEach, describe, expect, test } from 'vitest';
import {
  Enums,
  utilities,
  type PlanarViewport,
  type Types,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  captureViewportState,
  createPlanarViewport,
  recordEvents,
  renderAndWait,
  round6,
  type PlanarViewportContext,
} from './harness';

const { Events, OrientationAxis, RenderBackend, ViewportType } = Enums;
const { SynchronizerManager, synchronizers } = cornerstoneTools;
const {
  createZoomPanSynchronizer,
  createVOISynchronizer,
  createImageSliceSynchronizer,
  createCameraPositionSynchronizer,
} = synchronizers;

// ---------------------------------------------------------------------------
// Local setup helpers (this file's own -- the frozen harness is untouched)
// ---------------------------------------------------------------------------

let idCounter = 0;
function uniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${utilities.uuidv4()}`;
}

function toViewportId(ctx: PlanarViewportContext): Types.IViewportId {
  return {
    renderingEngineId: ctx.renderingEngine.id,
    viewportId: ctx.viewportId,
  };
}

/**
 * Attaches a second (or third) PlanarViewport to the SAME displaySetId that
 * `base` already registered via the harness's `createPlanarViewport()` --
 * AND to `base`'s own RenderingEngine instance (see the file-header comment
 * for why sharing the engine matters, not just the display set) -- so all
 * viewports resolve identical imageIds / FrameOfReferenceUID / dataId /
 * renderingEngineId without registering a second fake stack or a second
 * engine. Mirrors the construction inlined in planarInvariants.browser.test.ts's
 * "cross-viewport reference" test, generalized to reuse the engine too.
 * Deliberately does NOT touch the fake image loader, metadata provider, or
 * `useGenericViewport` config flag -- `base`'s own harness cleanup owns those.
 */
async function attachSharedViewport(
  base: PlanarViewportContext,
  label: string
): Promise<PlanarViewportContext> {
  const viewportId = uniqueId(`vitest-sync-${label}-viewport`);
  const { renderingEngine } = base;
  const element = document.createElement('div');
  element.dataset.testid = `sync-harness-${label}`;
  element.style.width = '400px';
  element.style.height = '400px';
  document.body.appendChild(element);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      orientation: OrientationAxis.AXIAL,
    },
  });

  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  await viewport.setDisplaySets({
    displaySetId: base.displaySetId,
    options: {
      orientation: OrientationAxis.AXIAL,
      renderBackend: RenderBackend.GPU,
    },
  });

  await renderAndWait(element, viewport);

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;

    // Only disable THIS viewport, never destroy the engine -- it is shared
    // with `base` (and any sibling attached viewports), whose own cleanup
    // owns the engine's lifetime.
    try {
      renderingEngine.disableElement(viewportId);
    } catch {
      // Engine may already be destroyed by `base`'s cleanup if teardown
      // order was inverted -- not an error for this viewport's own cleanup.
    }

    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  };

  return {
    viewport,
    element,
    renderingEngine,
    imageIds: base.imageIds,
    displaySetId: base.displaySetId,
    viewportId,
    cleanup,
  };
}

let cleanups: Array<() => void> = [];
function track(ctx: PlanarViewportContext): PlanarViewportContext {
  cleanups.push(() => ctx.cleanup());
  return ctx;
}

const synchronizerIds: string[] = [];
function trackSynchronizer(id: string): string {
  synchronizerIds.push(id);
  return id;
}

afterEach(() => {
  while (synchronizerIds.length) {
    const id = synchronizerIds.pop();
    try {
      SynchronizerManager.destroySynchronizer(id as string);
    } catch {
      // Already destroyed by the test itself -- not an error.
    }
  }

  // Belt-and-suspenders: guarantees no synchronizer from a failed test can
  // leak listeners into the next one, per the "run twice in a row" no-leakage
  // requirement.
  try {
    SynchronizerManager.destroy();
  } catch {
    // Nothing to destroy -- not an error.
  }

  while (cleanups.length) {
    const cleanup = cleanups.pop();

    try {
      cleanup?.();
    } catch {
      // Best-effort cleanup; a failure here must not mask the test's own
      // pass/fail result.
    }
  }

  document.body.innerHTML = '';
});

async function setupPair(
  label = 'pair'
): Promise<{ a: PlanarViewportContext; b: PlanarViewportContext }> {
  const a = track(await createPlanarViewport());
  const b = track(await attachSharedViewport(a, `${label}-b`));
  return { a, b };
}

async function setupTriple(): Promise<{
  a: PlanarViewportContext;
  b: PlanarViewportContext;
  c: PlanarViewportContext;
}> {
  const a = track(await createPlanarViewport());
  const b = track(await attachSharedViewport(a, 'triple-b'));
  const c = track(await attachSharedViewport(a, 'triple-c'));
  return { a, b, c };
}

function waitForEventOn(
  target: EventTarget,
  type: string,
  timeoutMs = 5000
): Promise<CustomEvent> {
  return new Promise<CustomEvent>((resolve, reject) => {
    const onEvent = (evt: Event) => {
      clearTimeout(timer);
      resolve(evt as CustomEvent);
    };

    const timer = setTimeout(() => {
      target.removeEventListener(type, onEvent);
      reject(new Error(`waitForEventOn: timed out waiting for "${type}"`));
    }, timeoutMs);

    target.addEventListener(type, onEvent, { once: true });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function doubleRAF(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// A generous-but-bounded window used ONLY for negative-result assertions
// ("this must NOT have propagated") where there is no positive event to wait
// on. Per shared-context rule 6/plan wording (test 7's own "500ms of
// quiescence-waiting"), a fixed wait is the accepted pattern for proving an
// absence of change; every use below is commented at the call site.
const NO_PROPAGATION_WAIT_MS = 400;

describe('synchronizers', () => {
  // -------------------------------------------------------------------------
  // 1. ZoomPan synchronizer
  // -------------------------------------------------------------------------
  describe('ZoomPan synchronizer', () => {
    test('syncs zoom and pan bidirectionally; a non-member viewport is untouched', async () => {
      const { a, b, c } = await setupTriple();
      const syncId = trackSynchronizer(uniqueId('zoom-pan-sync'));
      const sync = createZoomPanSynchronizer(syncId);
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      const cZoomBefore = round6(c.viewport.getZoom());
      const cPanBefore = c.viewport.getPan().map(round6);

      const bZoomRendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(2);
      await bZoomRendered;

      expect(round6(b.viewport.getZoom())).toBe(round6(2));
      // C was never added to the synchronizer: it must be completely unaffected.
      expect(round6(c.viewport.getZoom())).toBe(cZoomBefore);
      expect(c.viewport.getPan().map(round6)).toEqual(cPanBefore);

      const bPanRendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setPan([25, -10]);
      await bPanRendered;

      // Compared against A's OWN post-set getPan() (not the raw [25, -10]
      // input literal) with a 1e-3 epsilon per shared-context rule 6: A's own
      // setPan -> getPan round-trips through the projection's canvas/world
      // math and already carries ~1e-6-level floating point drift off the
      // literal input (observed: getPan()[1] reads -10.000002, not exactly
      // -10) independent of the synchronizer; the synchronizer's OWN
      // contribution to that drift being negligible next to it is exactly
      // what "equals A's exactly" should mean here.
      const aPan = a.viewport.getPan();
      const bPan = b.viewport.getPan();
      expect(bPan[0]).toBeCloseTo(aPan[0], 3);
      expect(bPan[1]).toBeCloseTo(aPan[1], 3);
      // Still untouched after the pan change too.
      expect(round6(c.viewport.getZoom())).toBe(cZoomBefore);
      expect(c.viewport.getPan().map(round6)).toEqual(cPanBefore);

      // Reverse direction: `.add()` wires each viewport as BOTH source and
      // target (it calls addTarget + addSource -- see
      // packages/tools/src/store/SynchronizerManager/Synchronizer.ts), so the
      // factory produces a bidirectional pair by construction; mutating B
      // must propagate back to A.
      const aRendered = waitForEventOn(a.element, Events.IMAGE_RENDERED);
      b.viewport.setZoom(3);
      await aRendered;

      expect(round6(a.viewport.getZoom())).toBe(round6(3));
    });
  });

  // -------------------------------------------------------------------------
  // 2. VOI synchronizer
  // -------------------------------------------------------------------------
  describe('VOI synchronizer', () => {
    test('syncs voiRange from A to B exactly', async () => {
      const { a, b } = await setupPair('voi');
      const syncId = trackSynchronizer(uniqueId('voi-sync'));
      const sync = createVOISynchronizer(syncId, {
        syncInvertState: true,
        syncColormap: true,
      });
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      const beforeRange = a.viewport.getDisplaySetPresentation(
        a.displaySetId
      )?.voiRange;
      const targetRange = { lower: 5, upper: 220 };
      // Sanity check that the mutation below is an actual change, not a no-op.
      expect(targetRange).not.toEqual(beforeRange);

      const voiOnB = waitForEventOn(b.element, Events.VOI_MODIFIED);
      a.viewport.setDisplaySetPresentation(a.displaySetId, {
        voiRange: targetRange,
      });
      await voiOnB;

      const aRange = a.viewport.getDisplaySetPresentation(a.displaySetId)
        ?.voiRange;
      const bRange = b.viewport.getDisplaySetPresentation(b.displaySetId)
        ?.voiRange;

      expect(bRange).toEqual(targetRange);
      expect(bRange).toEqual(aRange);
    });

    // BUG (observed / root-cause traced in source): voiSyncCallback
    // (packages/tools/src/synchronizers/callbacks/voiSyncCallback.ts) only
    // copies `invert` onto the target when the VOI_MODIFIED event's
    // `invertStateChanged` field is truthy. PlanarViewport's
    // `notifyDataPresentationModified`
    // (packages/core/src/RenderingEngine/GenericViewport/Planar/PlanarViewport.ts)
    // never includes `invertStateChanged` in the VOI_MODIFIED detail it
    // triggers (only `range`, `volumeId`, `VOILUTFunction`, `invert`,
    // `colormap`) -- so this branch is permanently dead for GenericViewports:
    // B's invert flag never updates, regardless of the (default-true)
    // `syncInvertState` option.
    test.fails(
      'does NOT sync the invert flag even though syncInvertState defaults to true',
      async () => {
        const { a, b } = await setupPair('voi-invert');
        const syncId = trackSynchronizer(uniqueId('voi-invert-sync'));
        const sync = createVOISynchronizer(syncId, {
          syncInvertState: true,
          syncColormap: true,
        });
        sync.add(toViewportId(a));
        sync.add(toViewportId(b));

        const beforeInvertB = b.viewport.getDisplaySetPresentation(
          b.displaySetId
        )?.invert;
        expect(beforeInvertB).toBeFalsy();

        const voiOnB = waitForEventOn(b.element, Events.VOI_MODIFIED);
        a.viewport.setDisplaySetPresentation(a.displaySetId, {
          voiRange: { lower: 1, upper: 2 },
          invert: true,
        });
        await voiOnB;

        expect(
          b.viewport.getDisplaySetPresentation(b.displaySetId)?.invert
        ).toBe(true);
      }
    );
  });

  // -------------------------------------------------------------------------
  // 3. ImageSlice synchronizer
  // -------------------------------------------------------------------------
  describe('ImageSlice synchronizer', () => {
    // BUG (observed / root-cause traced in source): imageSliceSyncCallback
    // (packages/tools/src/synchronizers/callbacks/imageSliceSyncCallback.ts)
    // calls `areViewportsCoplanar(sViewport, tViewport)`
    // (packages/tools/src/synchronizers/callbacks/areViewportsCoplanar.ts),
    // which calls `viewport.getCamera()` on both viewports.
    // GenericViewport/PlanarViewport
    // (packages/core/src/RenderingEngine/GenericViewport/Planar/PlanarViewport.ts)
    // has no public `getCamera()` method (only a protected
    // `getCameraForEvent()`), so this throws
    // "TypeError: sViewport.getCamera is not a function" inside the callback.
    // This is the SAME root-cause class as the CircleROITool /
    // getEllipseWorldCoordinates bug documented in
    // annotationToolsMatrix.browser.test.ts, but the failure mode here is
    // silent rather than an uncaught error: imageSliceSyncCallback is an
    // `async function`, so the synchronous throw becomes a REJECTED Promise
    // instead of a thrown exception; `Synchronizer.fireEvent`
    // (packages/tools/src/store/SynchronizerManager/Synchronizer.ts) collects
    // that promise and awaits it via `Promise.allSettled`, which fully
    // swallows the rejection. STACK_NEW_IMAGE itself DOES fire correctly on
    // the GenericViewport element (planarImageEvents.ts) -- the event wiring
    // this synchronizer depends on is fine; only its own callback is broken
    // for this viewport family.
    test.fails(
      'does NOT follow the source slice change (silently swallowed callback error)',
      async () => {
        const { a, b } = await setupPair('slice');
        const syncId = trackSynchronizer(uniqueId('image-slice-sync'));
        const sync = createImageSliceSynchronizer(syncId);
        sync.add(toViewportId(a));
        sync.add(toViewportId(b));

        expect(a.viewport.getSliceIndex()).toBe(0);
        expect(b.viewport.getSliceIndex()).toBe(0);

        const stackNewImageOnA = waitForEventOn(a.element, Events.STACK_NEW_IMAGE);
        await a.viewport.setImageIdIndex(3);
        await stackNewImageOnA;

        // No event to wait on for a definitive negative result (the failure
        // is a swallowed promise rejection, not an observable event) -- give
        // the async callback a bounded window to (not) run.
        await wait(NO_PROPAGATION_WAIT_MS);

        expect(b.viewport.getSliceIndex()).toBe(3);
      }
    );
  });

  // -------------------------------------------------------------------------
  // 4. CameraPosition synchronizer
  // -------------------------------------------------------------------------
  describe('CameraPosition synchronizer', () => {
    test('syncs zoom, pan, and world probes via the copied view reference + presentation', async () => {
      const { a, b } = await setupPair('camera');
      const syncId = trackSynchronizer(uniqueId('camera-position-sync'));
      const sync = createCameraPositionSynchronizer(syncId);
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      const rendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(2);
      a.viewport.setPan([12, -6]);
      await rendered;

      const snapA = captureViewportState(a.viewport, a.displaySetId);
      const snapB = captureViewportState(b.viewport, b.displaySetId);

      expect(snapB.core.zoom).toBe(snapA.core.zoom);
      expect(snapB.core.pan).toEqual(snapA.core.pan);
      expect(snapB.core.worldProbes).toEqual(snapA.core.worldProbes);
    });

    // GAP (observed / traced in source): cameraSyncCallback's GenericViewport
    // branch (packages/tools/src/synchronizers/callbacks/cameraSyncCallback.ts)
    // copies the source's ViewReference (spatial reference only -- carries no
    // rotation; rotation lives on ViewPresentation, see
    // packages/core/src/types/IViewport.ts) plus a zoom/pan-only
    // ViewPresentationSelector (`ZOOM_PAN_SELECTOR = { pan: true, zoom: true }`).
    // Rotation is therefore never transported to the target on
    // GenericViewports, unlike the legacy `setCamera(camera)` path this
    // synchronizer was built to replace (which carried the full camera,
    // including viewUp/rotation, for non-Generic viewports).
    test.fails(
      'does NOT sync rotation (ViewPresentation selector used by cameraSyncCallback excludes it)',
      async () => {
        const { a, b } = await setupPair('camera-rotation');
        const syncId = trackSynchronizer(
          uniqueId('camera-position-rotation-sync')
        );
        const sync = createCameraPositionSynchronizer(syncId);
        sync.add(toViewportId(a));
        sync.add(toViewportId(b));

        const rendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
        a.viewport.setViewState({ rotation: 45 });
        await rendered;

        expect(round6(b.viewport.getRotation())).toBe(round6(45));
      }
    );
  });

  // -------------------------------------------------------------------------
  // 5. Synchronizer API surface
  // -------------------------------------------------------------------------
  describe('Synchronizer API surface', () => {
    test('getSynchronizer / getAllSynchronizers / destroySynchronizer', async () => {
      const { a, b } = await setupPair('api-surface');
      const syncId = trackSynchronizer(uniqueId('api-surface-sync'));
      const sync = createZoomPanSynchronizer(syncId);
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      expect(SynchronizerManager.getSynchronizer(syncId)).toBe(sync);
      expect(
        SynchronizerManager.getAllSynchronizers().some((s) => s.id === syncId)
      ).toBe(true);

      const rendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(2);
      await rendered;
      expect(round6(b.viewport.getZoom())).toBe(round6(2));

      SynchronizerManager.destroySynchronizer(syncId);
      expect(SynchronizerManager.getSynchronizer(syncId)).toBeUndefined();
      expect(
        SynchronizerManager.getAllSynchronizers().some((s) => s.id === syncId)
      ).toBe(false);

      // Destroying the synchronizer must also stop syncing.
      const zoomAfterDestroy = round6(b.viewport.getZoom());
      a.viewport.setZoom(3);
      // No event to wait on for this negative result (destroy removes the
      // listeners entirely, so no CAMERA_MODIFIED-driven callback -- and
      // therefore no IMAGE_RENDERED -- is expected on B at all).
      await wait(NO_PROPAGATION_WAIT_MS);
      expect(round6(b.viewport.getZoom())).toBe(zoomAfterDestroy);
    });

    test('remove() stops syncing for just that viewport; re-add() resumes it', async () => {
      const { a, b } = await setupPair('remove-readd');
      const syncId = trackSynchronizer(uniqueId('remove-readd-sync'));
      const sync = createZoomPanSynchronizer(syncId);
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      const firstRendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(2);
      await firstRendered;
      expect(round6(b.viewport.getZoom())).toBe(round6(2));

      sync.remove(toViewportId(b));

      const zoomAfterRemove = round6(b.viewport.getZoom());
      a.viewport.setZoom(2.5);
      // Negative result: B was removed as both source and target, so nothing
      // should arrive; no event to wait on.
      await wait(NO_PROPAGATION_WAIT_MS);
      expect(round6(b.viewport.getZoom())).toBe(zoomAfterRemove);

      sync.add(toViewportId(b));

      const resumedRendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(3);
      await resumedRendered;
      expect(round6(b.viewport.getZoom())).toBe(round6(3));
    });

    test('setEnabled(false) pauses syncing; re-enabling resumes it', async () => {
      const { a, b } = await setupPair('enabled-toggle');
      const syncId = trackSynchronizer(uniqueId('enabled-toggle-sync'));
      const sync = createZoomPanSynchronizer(syncId);
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      sync.setEnabled(false);

      const zoomWhileDisabled = round6(b.viewport.getZoom());
      a.viewport.setZoom(2);
      // Negative result: the synchronizer's listeners stay attached while
      // disabled (only its internal `_enabled` flag flips -- see
      // Synchronizer.isDisabled()/fireEvent), so there genuinely is no event
      // to wait on; the callback is a documented no-op while disabled.
      await wait(NO_PROPAGATION_WAIT_MS);
      expect(round6(b.viewport.getZoom())).toBe(zoomWhileDisabled);

      sync.setEnabled(true);

      const rendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(2.5);
      await rendered;
      expect(round6(b.viewport.getZoom())).toBe(round6(2.5));
    });
  });

  // -------------------------------------------------------------------------
  // 6. Custom synchronizer callback contract
  // -------------------------------------------------------------------------
  describe('Custom synchronizer callback contract', () => {
    test('callback receives (synchronizer, sourceViewport, targetViewport, sourceEvent)', async () => {
      const { a, b } = await setupPair('custom-callback');
      const syncId = trackSynchronizer(uniqueId('custom-callback-sync'));

      type CallArgs = [unknown, Types.IViewportId, Types.IViewportId, Event, unknown?];
      const calls: CallArgs[] = [];

      function callbackSpy(
        synchronizerArg: unknown,
        sourceViewportArg: Types.IViewportId,
        targetViewportArg: Types.IViewportId,
        sourceEventArg: Event,
        optionsArg?: unknown
      ): void {
        calls.push([
          synchronizerArg,
          sourceViewportArg,
          targetViewportArg,
          sourceEventArg,
          optionsArg,
        ]);
      }

      const sync = SynchronizerManager.createSynchronizer(
        syncId,
        Events.CAMERA_MODIFIED,
        callbackSpy
      );
      sync.addSource(toViewportId(a));
      sync.addTarget(toViewportId(b));

      // CAMERA_MODIFIED fires SYNCHRONOUSLY inside setZoom (GenericViewport's
      // `modified()` calls `triggerCameraModifiedEvent` right after scheduling
      // the render -- see
      // packages/core/src/RenderingEngine/GenericViewport/GenericViewport.ts),
      // and the custom callback here does no async work, so the call is
      // observable immediately with no wait needed.
      a.viewport.setZoom(2);

      expect(calls.length).toBe(1);
      const [
        synchronizerArg,
        sourceViewportArg,
        targetViewportArg,
        sourceEventArg,
      ] = calls[0];

      expect(synchronizerArg).toBe(sync);
      expect(sourceViewportArg).toEqual({
        renderingEngineId: a.renderingEngine.id,
        viewportId: a.viewportId,
      });
      expect(targetViewportArg).toEqual({
        renderingEngineId: b.renderingEngine.id,
        viewportId: b.viewportId,
      });
      expect(sourceEventArg).toBeInstanceOf(Event);
      expect((sourceEventArg as CustomEvent).type).toBe(Events.CAMERA_MODIFIED);
      expect((sourceEventArg as CustomEvent).detail?.viewportId).toBe(
        a.viewportId
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. No sync storms / feedback loops
  // -------------------------------------------------------------------------
  describe('No sync storms', () => {
    test('a single zoom change converges without oscillation or event storms', async () => {
      const { a, b } = await setupPair('no-storm');
      const syncId = trackSynchronizer(uniqueId('no-storm-sync'));
      const sync = createZoomPanSynchronizer(syncId);
      sync.add(toViewportId(a));
      sync.add(toViewportId(b));

      const recorderA = recordEvents(a.element, [Events.IMAGE_RENDERED]);
      const recorderB = recordEvents(b.element, [Events.IMAGE_RENDERED]);

      const bRendered = waitForEventOn(b.element, Events.IMAGE_RENDERED);
      a.viewport.setZoom(2);
      await bRendered;

      // Quiescence window: give any secondary/feedback renders time to
      // surface before counting. Per the plan's own wording for this test,
      // this is a bounded negative-result wait (proving nothing further
      // happens), not a positive event-driven one.
      await wait(500);

      expect(recorderA.count(Events.IMAGE_RENDERED)).toBeLessThanOrEqual(3);
      expect(recorderB.count(Events.IMAGE_RENDERED)).toBeLessThanOrEqual(3);

      const zoomA1 = round6(a.viewport.getZoom());
      const zoomB1 = round6(b.viewport.getZoom());
      await doubleRAF();
      const zoomA2 = round6(a.viewport.getZoom());
      const zoomB2 = round6(b.viewport.getZoom());

      expect(zoomA2).toBe(zoomA1);
      expect(zoomB2).toBe(zoomB1);
      expect(zoomB1).toBe(round6(2));
    });
  });
});
