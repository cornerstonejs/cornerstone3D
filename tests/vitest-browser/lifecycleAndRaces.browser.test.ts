// Plan 4: lifecycle, teardown, and race-condition coverage for the
// GenericViewport (PLANAR_NEXT) architecture. State-based only -- no
// screenshots. See plans/vitest-browser-state-tests/04-lifecycle-teardown-races.md.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  cache,
  Enums,
  getConfiguration,
  getRenderingEngine,
  imageLoader,
  init,
  RenderingEngine,
  utilities,
  type PlanarViewport,
} from '@cornerstonejs/core';
import {
  createPlanarViewport,
  recordEvents,
  registerFakeImageStack,
  renderAndWait,
  round6,
  type PlanarViewportContext,
} from './harness';

const { Events, OrientationAxis, RenderBackend, ViewportStatus, ViewportType } =
  Enums;

// ----------------------------------------------------------------------------
// Global error trap (shared-context / plan-04 requirement): any async error
// escaping the engine during these scenarios is itself a failure. Installed
// once at module scope; beforeEach clears the buffer, afterEach asserts it is
// empty (before running cleanup) unless a test-local catch already consumed
// the rejection/error.
// ----------------------------------------------------------------------------

interface CapturedGlobalError {
  kind: 'error' | 'unhandledrejection';
  message: string;
}

const capturedGlobalErrors: CapturedGlobalError[] = [];

function onWindowError(event: ErrorEvent): void {
  capturedGlobalErrors.push({
    kind: 'error',
    message: event.message || String(event.error ?? 'unknown window error'),
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  capturedGlobalErrors.push({
    kind: 'unhandledrejection',
    message: String(event.reason ?? 'unknown unhandled rejection'),
  });
}

window.addEventListener('error', onWindowError);
window.addEventListener('unhandledrejection', onUnhandledRejection);

// ----------------------------------------------------------------------------
// Per-test cleanup tracking (mirrors the safety-net pattern already
// established in renderPathParity.browser.test.ts): tests push a harness
// context's cleanup() (or a local cleanup function) here; afterEach runs and
// drains the list even if a test throws before reaching its own teardown.
// ----------------------------------------------------------------------------

let activeCleanups: Array<() => void> = [];

function track<T extends { cleanup(): void }>(ctx: T): T {
  activeCleanups.push(ctx.cleanup);
  return ctx;
}

function runActiveCleanups(): void {
  while (activeCleanups.length) {
    const cleanup = activeCleanups.pop();

    try {
      cleanup?.();
    } catch {
      // best-effort safety net only
    }
  }
}

beforeEach(() => {
  capturedGlobalErrors.length = 0;
});

afterEach(() => {
  try {
    expect(
      capturedGlobalErrors,
      `unexpected global error(s)/unhandled rejection(s): ${JSON.stringify(
        capturedGlobalErrors
      )}`
    ).toEqual([]);
  } finally {
    runActiveCleanups();
  }
});

// ----------------------------------------------------------------------------
// 1. Enable -> disable -> re-enable the same element
// ----------------------------------------------------------------------------

test('enable -> disable -> re-enable the same element yields a live, distinct viewport with no leaked canvases', async () => {
  const ctx = track(await createPlanarViewport());
  const { renderingEngine, element, viewportId, displaySetId } = ctx;
  const firstViewport = ctx.viewport;

  // Pinned: a live PlanarViewport legitimately owns two canvas elements, not
  // one -- the vtk.js on-screen canvas created by getOrCreateCanvas() (inside
  // a shared div.viewport-element wrapper) plus a dedicated per-instance
  // `cpuCanvas` overlay that the PlanarViewport constructor always appends
  // directly to `element` (used for CPU-path compositing; hidden via
  // display:none in GPU modes -- see PlanarViewport constructor around the
  // `cpuCanvas` field). So the correct "no leftover canvases" check is that
  // the count returns to this same per-instance baseline after a disable/
  // re-enable cycle, not that it equals 1.
  const canvasCountBeforeDisable = element.querySelectorAll('canvas').length;
  expect(canvasCountBeforeDisable).toBe(2);

  renderingEngine.disableElement(viewportId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      orientation: OrientationAxis.AXIAL,
    },
  });

  const secondViewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  expect(secondViewport).toBeTruthy();
  expect(secondViewport).not.toBe(firstViewport);

  await secondViewport.setDisplaySets({
    displaySetId,
    options: {
      orientation: OrientationAxis.AXIAL,
      renderBackend: RenderBackend.GPU,
    },
  });

  const recorder = recordEvents(element, [Events.IMAGE_RENDERED]);
  await renderAndWait(element, secondViewport);
  expect(recorder.count(Events.IMAGE_RENDERED)).toBeGreaterThanOrEqual(1);
  recorder.stop();

  expect(renderingEngine.getViewport(viewportId)).toBe(secondViewport);
  // Pinned: disableElement() removes the old instance's cpuCanvas
  // (PlanarViewport.onDestroy() calls this.cpuCanvas?.remove()) while the
  // vtk.js on-screen canvas is left in place and reused by the new instance's
  // getOrCreateCanvas() call; the new instance's constructor then appends its
  // own fresh cpuCanvas. Net effect: the count returns to the original
  // baseline (2) rather than growing (would be 3+ if the old vtk canvas were
  // duplicated, or if the old cpuCanvas leaked).
  expect(element.querySelectorAll('canvas').length).toBe(
    canvasCountBeforeDisable
  );
});

// ----------------------------------------------------------------------------
// 2. Destroy semantics
// ----------------------------------------------------------------------------

test('renderingEngine.destroy() invalidates the engine and makes the viewport a safe no-op, but does not remove DOM children', async () => {
  const ctx = track(await createPlanarViewport());
  const { renderingEngine, renderingEngineId, viewportId, element, viewport } =
    ctx;

  expect(element.querySelector('canvas')).not.toBeNull();
  expect(element.getAttribute('data-viewport-uid')).toBe(viewportId);

  renderingEngine.destroy();

  // Pinned: getRenderingEngine(id) no longer resolves the destroyed engine
  // (BaseRenderingEngine.destroy() calls renderingEngineCache.delete(this.id)).
  expect(getRenderingEngine(renderingEngineId)).toBeUndefined();

  // Pinned: getViewport() on the (still-referenced) destroyed engine instance
  // returns undefined rather than throwing. BaseRenderingEngine._reset()
  // replaces the internal viewport map with a fresh empty Map, and
  // getViewport() never calls _throwIfDestroyed().
  expect(renderingEngine.getViewport(viewportId)).toBeUndefined();

  // Pinned: viewport.render() after the owning engine has been destroyed is a
  // documented no-op, not a throw. BaseRenderingEngine._resetViewport() (run
  // from destroy() -> _reset()) calls viewport.destroy?.() on every mounted
  // viewport, which sets PlanarViewport.isDestroyed = true; render() checks
  // that flag first and returns immediately.
  let renderThrew = false;
  let renderError: unknown;

  try {
    viewport.render();
  } catch (error) {
    renderThrew = true;
    renderError = error;
  }

  expect(renderThrew, `viewport.render() threw: ${String(renderError)}`).toBe(
    false
  );

  // Pinned: destroy() removes the viewport-authored data attributes from the
  // element (PlanarViewport.destroy() calls element.removeAttribute for both
  // data-viewport-uid and data-rendering-engine-uid)...
  expect(element.getAttribute('data-viewport-uid')).toBeNull();

  // ...but does NOT remove the canvas / internal wrapper div it created.
  // Neither BaseRenderingEngine._resetViewport() nor PlanarViewport.destroy()
  // /onDestroy() ever calls removeChild on the wrapper
  // (div.viewport-element) or the canvas (canvas.cornerstone-canvas) --
  // _resetViewport() only clears the 2D context and removes attributes. This
  // is a leak-by-design consequence of getOrCreateCanvas() reusing an
  // existing canvas/wrapper found on the element rather than recreating one
  // (see test 1: this is exactly what makes re-enable-on-the-same-element
  // produce a single reused canvas instead of a second one).
  expect(element.querySelector('canvas')).not.toBeNull();
  expect(element.querySelector('div.viewport-element')).not.toBeNull();
});

// ----------------------------------------------------------------------------
// 3. Double cleanup is safe
// ----------------------------------------------------------------------------

test('harness cleanup() is idempotent: calling it a second time does not throw', async () => {
  const ctx = await createPlanarViewport();

  ctx.cleanup();

  expect(() => ctx.cleanup()).not.toThrow();
});

// ----------------------------------------------------------------------------
// 4. Cache accounting
// ----------------------------------------------------------------------------

test('cache accounts for every loaded stack image and returns to baseline after destroy + purgeCache', async () => {
  const before = cache.getCacheSize();

  const ctx = await createPlanarViewport({
    stack: { name: 'cache-accounting', sliceCount: 5, rows: 64, columns: 64 },
  });
  const { imageIds } = ctx;

  expect(imageIds.length).toBe(5);

  // Pinned: a stack-backed planar display set lazy-loads one slice at a time,
  // not the whole stack up front. DefaultPlanarDataProvider.loadPlanarData
  // only calls loadAndCacheImage() for the requested initialImageIdIndex, and
  // VtkImageMapperRenderPath's navigation path only loads the *target* slice
  // of a setImageIdIndex/scroll call. So immediately after the first render,
  // only imageIds[0] is cached -- the other 4 registered imageIds are known
  // to the display set (metadata-registered) but not yet loaded.
  expect(cache.isLoaded(imageIds[0])).toBe(true);
  for (let i = 1; i < imageIds.length; i++) {
    expect(cache.isLoaded(imageIds[i]), imageIds[i]).toBe(false);
  }

  // Force every remaining slice to load via the same public cache API an
  // application would use to prefetch a stack, so the "every imageId is
  // present" accounting below reflects a real, deterministic cache state
  // rather than depending on render-timing of the lazy per-slice navigation
  // load (which resolves off-band from setImageIdIndex/scroll's own promise).
  for (let i = 1; i < imageIds.length; i++) {
    await imageLoader.loadAndCacheImage(imageIds[i]);
  }

  for (const imageId of imageIds) {
    expect(cache.isLoaded(imageId), imageId).toBe(true);
    expect(cache.getImageLoadObject(imageId), imageId).toBeTruthy();
  }

  const afterLoad = cache.getCacheSize();
  expect(afterLoad - before).toBeGreaterThanOrEqual(5 * 64 * 64);

  // Ordering constraint: purge only after the engine/viewport are torn down.
  // Calling cache.purgeCache() while the viewport is still bound would pull
  // pixel data out from under a live render path; ctx.cleanup() destroys the
  // rendering engine BEFORE calling cache.purgeCache() (see
  // harness/createPlanarViewport.ts), and this test calls cleanup() directly
  // (rather than deferring to afterEach) precisely so that ordering is
  // exercised and its effect on cache size can be observed inline.
  ctx.cleanup();

  expect(cache.getCacheSize()).toBe(0);
});

// ----------------------------------------------------------------------------
// 5. setDisplaySets race: last call wins
// ----------------------------------------------------------------------------

interface RaceStacks {
  idA: string;
  idB: string;
  imageIdsA: string[];
  imageIdsB: string[];
  unregister(): void;
}

function registerRaceStacks(prefix: string): RaceStacks {
  const stackA = registerFakeImageStack({ name: `${prefix}-A`, sliceCount: 5 });
  const stackB = registerFakeImageStack({ name: `${prefix}-B`, sliceCount: 3 });
  const idA = `${prefix}-displayset-A`;
  const idB = `${prefix}-displayset-B`;

  utilities.genericViewportDisplaySetMetadataProvider.add(idA, {
    imageIds: stackA.imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(idB, {
    imageIds: stackB.imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  return {
    idA,
    idB,
    imageIdsA: stackA.imageIds,
    imageIdsB: stackB.imageIds,
    unregister(): void {
      stackA.unregister();
      stackB.unregister();
    },
  };
}

async function createRaceViewport(): Promise<PlanarViewportContext> {
  return track(
    await createPlanarViewport({
      skipDisplaySets: true,
      stack: { name: 'race-harness-unused', sliceCount: 1 },
    })
  );
}

describe('setDisplaySets race: last call wins', () => {
  test('control: sequential awaits settle on B (5-slice A, then 3-slice B)', async () => {
    const ctx = await createRaceViewport();
    const race = registerRaceStacks('vitest-race-control');

    try {
      const { viewport, element } = ctx;

      await viewport.setDisplaySets({
        displaySetId: race.idA,
        options: { renderBackend: RenderBackend.GPU },
      });
      await viewport.setDisplaySets({
        displaySetId: race.idB,
        options: { renderBackend: RenderBackend.GPU },
      });
      await renderAndWait(element, viewport);

      expect(
        viewport.getDisplaySets().map((entry) => entry.displaySetId)
      ).toEqual([race.idB]);
      expect(viewport.getNumberOfSlices()).toBe(3);
      expect(viewport.getImageIds()).toEqual(race.imageIdsB);
    } finally {
      race.unregister();
    }
  });

  test('race: concurrent calls (A started first, B started second) settle on B without interleaved state', async () => {
    const ctx = await createRaceViewport();
    const race = registerRaceStacks('vitest-race-concurrent');

    try {
      const { viewport, element } = ctx;

      const pA = viewport.setDisplaySets({
        displaySetId: race.idA,
        options: { renderBackend: RenderBackend.GPU },
      });
      const pB = viewport.setDisplaySets({
        displaySetId: race.idB,
        options: { renderBackend: RenderBackend.GPU },
      });

      await Promise.allSettled([pA, pB]);
      await renderAndWait(element, viewport);

      // If this fails, it indicates a zombie mount: A's async completion
      // clobbered B's after B was already the last call. Per shared-context
      // rule 5, if that happens this test must be converted to test.fails
      // with the observed values recorded in a comment -- see the run report.
      expect(
        viewport.getDisplaySets().map((entry) => entry.displaySetId)
      ).toEqual([race.idB]);
      expect(viewport.getNumberOfSlices()).toBe(3);
      expect(viewport.getImageIds()).toEqual(race.imageIdsB);
    } finally {
      race.unregister();
    }
  });

  test('reverse-order race: concurrent calls (B started first, A started second) settle on A', async () => {
    const ctx = await createRaceViewport();
    const race = registerRaceStacks('vitest-race-reverse');

    try {
      const { viewport, element } = ctx;

      const pB = viewport.setDisplaySets({
        displaySetId: race.idB,
        options: { renderBackend: RenderBackend.GPU },
      });
      const pA = viewport.setDisplaySets({
        displaySetId: race.idA,
        options: { renderBackend: RenderBackend.GPU },
      });

      await Promise.allSettled([pB, pA]);
      await renderAndWait(element, viewport);

      expect(
        viewport.getDisplaySets().map((entry) => entry.displaySetId)
      ).toEqual([race.idA]);
      expect(viewport.getNumberOfSlices()).toBe(5);
      expect(viewport.getImageIds()).toEqual(race.imageIdsA);
    } finally {
      race.unregister();
    }
  });
});

// ----------------------------------------------------------------------------
// 6. Scroll during load
// ----------------------------------------------------------------------------

test('scroll calls fired during an in-flight setDisplaySets reject cleanly and leave the slice index in bounds', async () => {
  const ctx = track(
    await createPlanarViewport({
      skipDisplaySets: true,
      stack: { name: 'scroll-during-load', sliceCount: 5 },
    })
  );
  const { viewport, element, imageIds, displaySetId } = ctx;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  const setDisplaySetsPromise = viewport.setDisplaySets({
    displaySetId,
    options: { renderBackend: RenderBackend.GPU },
  });

  // Fired without awaiting, immediately after setDisplaySets and before its
  // internal await settles: getImageIds() is still empty at this instant (no
  // binding mounted yet), so PlanarViewport.setImageIdIndex() is documented
  // to reject with "Cannot set image index on empty stack". Each rejection is
  // caught locally here -- this is the "specific scenario has a known,
  // legitimately expected error" case the global error trap rule allows for.
  const scrollResults = [1, 1, 1].map((delta) =>
    viewport.scroll(delta).catch((error) => ({ caught: error }))
  );

  await setDisplaySetsPromise;
  await Promise.all(scrollResults);
  await renderAndWait(element, viewport);

  const sliceIndex = viewport.getSliceIndex();
  const numberOfSlices = viewport.getNumberOfSlices();

  expect(sliceIndex).toBeGreaterThanOrEqual(0);
  expect(sliceIndex).toBeLessThan(numberOfSlices);
});

// ----------------------------------------------------------------------------
// 7. removeData
// ----------------------------------------------------------------------------

test('removeData clears bindings and actors, and viewportStatus returns to noData', async () => {
  const ctx = track(await createPlanarViewport());
  const { viewport, displaySetId } = ctx;

  viewport.removeData(displaySetId);

  expect(viewport.getDisplaySets()).toEqual([]);
  expect(viewport.getActors()).toEqual([]);

  let renderThrew = false;

  try {
    viewport.render();
  } catch {
    renderThrew = true;
  }

  expect(renderThrew).toBe(false);

  // Pinned: PlanarViewport.render() sets viewportStatus to NO_DATA ('noData')
  // synchronously as soon as bindings.size is 0 (this already happened as a
  // side effect of removeData()'s own internal render() call via
  // GenericViewport.removeData -> this.render()); the explicit render() call
  // above is a no-op re-confirmation of that same state.
  expect(viewport.viewportStatus).toBe(ViewportStatus.NO_DATA);
});

// ----------------------------------------------------------------------------
// 8. Resize keeps the view anchored
// ----------------------------------------------------------------------------

test('resize keeps the fit-mode anchor world point centered after the canvas dimensions change', async () => {
  const ctx = track(await createPlanarViewport({ width: 400, height: 400 }));
  const { viewport, element, renderingEngine } = ctx;

  const canvasBefore = viewport.getCanvas();
  const widthBefore = canvasBefore.width;
  const heightBefore = canvasBefore.height;
  const centerWorldBefore = viewport.canvasToWorld([
    widthBefore / 2,
    heightBefore / 2,
  ]);

  element.style.width = '600px';
  element.style.height = '300px';

  renderingEngine.resize();
  await renderAndWait(element, viewport);

  const canvasAfter = viewport.getCanvas();
  const widthAfter = canvasAfter.width;
  const heightAfter = canvasAfter.height;

  expect(widthAfter).not.toBe(widthBefore);
  expect(heightAfter).not.toBe(heightBefore);
  // deviceScaleFactor is pinned to 1 in vitest.browser.config.ts, so the
  // on-screen canvas backing size should match the new CSS size exactly.
  expect(widthAfter).toBe(600);
  expect(heightAfter).toBe(300);

  const centerWorldAfter = viewport.canvasToWorld([
    widthAfter / 2,
    heightAfter / 2,
  ]);

  // Pinned "fit mode recenter" semantics: PlanarViewport's default view state
  // (createDefaultPlanarViewState, Planar/planarViewState.ts) uses
  // scaleMode 'fit' with anchorCanvas [0.5, 0.5] (fractional canvas center).
  // ContextPoolRenderingEngine._resizeVTKViewports special-cases Generic
  // viewports (isGenericViewport(vp)) to call only vp.resize() and skip the
  // legacy getCamera/setCamera snapshot-restore dance; PlanarViewport.resize()
  // -> resizeBindingsWithActiveFirst() recomputes the fit scale for the new
  // canvas size while keeping the same fractional anchor point pinned to the
  // same world point. So the world point under the canvas center should be
  // preserved (within 1e-1 world units) even though the pixel dimensions,
  // aspect ratio, and zoom level all change.
  const worldEpsilon = 1e-1;

  for (let axis = 0; axis < 3; axis++) {
    const delta = Math.abs(centerWorldAfter[axis] - centerWorldBefore[axis]);
    expect(
      delta,
      `axis ${axis}: before=${centerWorldBefore[axis]} after=${centerWorldAfter[axis]}`
    ).toBeLessThanOrEqual(worldEpsilon);
  }
});

// ----------------------------------------------------------------------------
// 9. Many viewports independence
// ----------------------------------------------------------------------------

test('a 2x2 grid of viewports on one engine renders independently; disabling one leaves the others untouched', async () => {
  init();

  const renderingConfig = getConfiguration().rendering;
  const previousUseGenericViewport = renderingConfig.useGenericViewport;
  renderingConfig.useGenericViewport = true;

  const stack = registerFakeImageStack({
    name: 'grid-independence',
    sliceCount: 5,
  });
  const gridRenderingEngineId = `vitest-lifecycle-grid-engine-${utilities.uuidv4()}`;
  const gridDisplaySetId = `vitest-lifecycle-grid-displayset-${utilities.uuidv4()}`;
  const renderingEngine = new RenderingEngine(gridRenderingEngineId);
  const viewportIds = [0, 1, 2, 3].map(
    (index) => `vitest-lifecycle-grid-viewport-${index}`
  );
  const elements: HTMLDivElement[] = [];

  utilities.genericViewportDisplaySetMetadataProvider.add(gridDisplaySetId, {
    imageIds: stack.imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  const cleanupGrid = (): void => {
    getRenderingEngine(gridRenderingEngineId)?.destroy();
    cache.purgeCache();
    stack.unregister();
    imageLoader.unregisterAllImageLoaders();
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();

    for (const element of elements) {
      element.parentNode?.removeChild(element);
    }

    if (previousUseGenericViewport !== undefined) {
      getConfiguration().rendering.useGenericViewport =
        previousUseGenericViewport;
    }
  };

  activeCleanups.push(cleanupGrid);

  for (const viewportId of viewportIds) {
    const element = document.createElement('div');
    element.style.width = '200px';
    element.style.height = '200px';
    document.body.appendChild(element);
    elements.push(element);

    renderingEngine.enableElement({
      viewportId,
      type: ViewportType.PLANAR_NEXT,
      element,
      defaultOptions: {
        orientation: OrientationAxis.AXIAL,
      },
    });
  }

  const viewports = viewportIds.map((viewportId) =>
    renderingEngine.getViewport<PlanarViewport>(viewportId)
  );

  for (const [index, viewport] of viewports.entries()) {
    await viewport.setDisplaySets({
      displaySetId: gridDisplaySetId,
      options: { renderBackend: RenderBackend.GPU },
    });
    await renderAndWait(elements[index], viewport);
  }

  expect(new Set(viewports.map((vp) => vp.id)).size).toBe(4);

  for (const viewport of viewports) {
    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);
  }

  const stateBefore = viewports.slice(1).map((viewport) => ({
    sliceIndex: viewport.getSliceIndex(),
    zoom: round6(viewport.getZoom()),
  }));

  renderingEngine.disableElement(viewportIds[0]);

  expect(renderingEngine.getViewport(viewportIds[0])).toBeUndefined();

  for (const [index, viewport] of viewports.slice(1).entries()) {
    await renderAndWait(elements[index + 1], viewport);
    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);
  }

  const stateAfter = viewports.slice(1).map((viewport) => ({
    sliceIndex: viewport.getSliceIndex(),
    zoom: round6(viewport.getZoom()),
  }));

  expect(stateAfter).toEqual(stateBefore);
});
