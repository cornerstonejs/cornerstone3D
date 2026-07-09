// Plan 3: event contracts.
//
// Pins the observable event behavior of PlanarViewport (GenericViewport /
// PLANAR_NEXT) as a contract: which events fire, how many, in what order,
// with what payload shape, and that nothing fires after teardown. Downstream
// consumers (tools, OHIF) build on this surface; regressions here are
// invisible to screenshot tests.
//
// Event source facts verified against
// packages/core/src/RenderingEngine/GenericViewport/Planar/planarImageEvents.ts,
// GenericViewport.ts, PlanarViewport.ts, BaseRenderingEngine.ts and
// ContextPoolRenderingEngine.ts before writing any assertion:
// - ELEMENT_ENABLED / ELEMENT_DISABLED are triggered on the module-level
//   `eventTarget` singleton (BaseRenderingEngine.ts), NOT on the viewport
//   element. They do not bubble there because there is nowhere to bubble to.
// - IMAGE_RENDERED is triggered on the viewport element by the rendering
//   engine's `_renderFlaggedViewports` RAF callback (ContextPoolRenderingEngine.ts),
//   once per flagged viewport per animation frame, regardless of how many
//   `render()` calls were coalesced into that frame.
// - CAMERA_MODIFIED is triggered synchronously (not deferred to a frame) by
//   `GenericViewport.modified()` every time `setViewState`/the Planar
//   zoom/pan/scale legacy shims run, as long as a previous camera snapshot
//   was resolvable.
// - STACK_NEW_IMAGE is triggered by `triggerPlanarNewImage` in
//   planarImageEvents.ts, on the viewport element, only for the source
//   binding, only when the render path actually swaps to a new image alone
//   (`resolvePlanarRenderPathCurrentImageIdIndex` dedups against the last
//   *requested* index) -- so it fires on scroll/setImageIdIndex but not on a
//   pure zoom/pan/rotation call.
// - VOI_MODIFIED is triggered by `PlanarViewport.notifyDataPresentationModified`
//   whenever a `setDisplaySetPresentation` call touches `voiRange`/`invert`/
//   `voiLUTFunction` AND resolves a non-undefined range -- this happens on
//   every touching call with no old-vs-new diff, including a no-op repeat
//   (see test 6, marked `test.fails`).
//
// CustomEvents here are created via `triggerEvent` with no `bubbles: true`,
// so they do not bubble; the recorder is always attached directly to the
// actual dispatch target (the viewport element, or the `eventTarget`
// singleton for lifecycle events).

import { afterEach, expect, test } from 'vitest';
import { Enums, eventTarget, utilities } from '@cornerstonejs/core';
import {
  createPlanarViewport,
  recordEvents,
  renderAndWait,
  type PlanarViewportContext,
  type RecordEventsHandle,
} from './harness';

const { Events, OrientationAxis, ViewportType } = Enums;

// Safety net: if a test throws before reaching its own cleanup, this ensures
// rendering engines, recorders, and DOM elements do not leak into later
// tests (or other suites -- vitest.browser.config.ts sets
// fileParallelism: false).
let pendingTeardowns: Array<() => void> = [];

function track(teardown: () => void): void {
  pendingTeardowns.push(teardown);
}

afterEach(() => {
  while (pendingTeardowns.length) {
    const teardown = pendingTeardowns.pop();

    try {
      teardown?.();
    } catch {
      // best-effort safety net only
    }
  }
});

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * Waits until `recorder` has seen no new events across two consecutive
 * animation frames, per the plan's quiescence definition. Bounded by
 * maxFrames so a genuinely stuck event stream fails the test instead of
 * hanging it.
 */
async function waitForQuiescence(
  recorder: RecordEventsHandle,
  opts: { maxFrames?: number } = {}
): Promise<void> {
  const { maxFrames = 60 } = opts;
  let stableFrames = 0;
  let lastCount = recorder.events.length;

  for (let frame = 0; frame < maxFrames; frame++) {
    await nextAnimationFrame();

    const currentCount = recorder.events.length;

    if (currentCount === lastCount) {
      stableFrames += 1;

      if (stableFrames >= 2) {
        return;
      }
    } else {
      stableFrames = 0;
      lastCount = currentCount;
    }
  }

  throw new Error(
    `waitForQuiescence: events still changing after ${maxFrames} animation frames`
  );
}

async function waitAnimationFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextAnimationFrame();
  }
}

// All event types this suite cares about, across every render path (only
// the vtkImage default mode is exercised here per the harness default, but
// the list matches the full set named in the plan plus what
// planarImageEvents.ts can emit for volume-backed data).
const ALL_TRACKED_EVENTS = [
  Events.IMAGE_RENDERED,
  Events.CAMERA_MODIFIED,
  Events.CAMERA_RESET,
  Events.VOI_MODIFIED,
  Events.COLORMAP_MODIFIED,
  Events.DISPLAY_AREA_MODIFIED,
  Events.STACK_NEW_IMAGE,
  Events.VOLUME_NEW_IMAGE,
];

interface ElementLifecycleDetail {
  viewportId?: string;
  renderingEngineId?: string;
}

interface CameraModifiedDetail {
  viewportId?: string;
  renderingEngineId?: string;
}

interface StackNewImageDetail {
  viewportId?: string;
  imageId?: string;
  imageIdIndex?: number;
}

interface VoiModifiedDetail {
  viewportId?: string;
  range?: { upper: number; lower: number };
  invert?: boolean;
}

async function setupViewport(): Promise<PlanarViewportContext> {
  const ctx = await createPlanarViewport();
  track(ctx.cleanup);
  return ctx;
}

// ==========================================================================
// 1. Enable/disable lifecycle events
// ==========================================================================

test('enable fires exactly one ELEMENT_ENABLED on eventTarget with the viewportId; destroy fires one ELEMENT_DISABLED per enabled viewport', async () => {
  const recorder = recordEvents(eventTarget, [
    Events.ELEMENT_ENABLED,
    Events.ELEMENT_DISABLED,
  ]);
  track(recorder.stop);

  const ctx = await createPlanarViewport({ skipDisplaySets: true });
  track(ctx.cleanup);

  expect(recorder.count(Events.ELEMENT_ENABLED)).toBe(1);
  expect(recorder.count(Events.ELEMENT_DISABLED)).toBe(0);

  const enabledEvent = recorder.events.find(
    (event) => event.type === Events.ELEMENT_ENABLED
  );
  const enabledDetail = enabledEvent?.detail as
    | ElementLifecycleDetail
    | undefined;

  expect(enabledDetail?.viewportId).toBe(ctx.viewportId);
  expect(enabledDetail?.renderingEngineId).toBe(
    ctx.renderingEngine.id
  );

  // Enable a second viewport on the SAME rendering engine to prove
  // ELEMENT_DISABLED fires once *per enabled viewport* on destroy(), not
  // once per destroy() call.
  const secondViewportId = `${ctx.viewportId}-second`;
  const secondElement = document.createElement('div');
  secondElement.style.width = '200px';
  secondElement.style.height = '200px';
  document.body.appendChild(secondElement);

  ctx.renderingEngine.enableElement({
    viewportId: secondViewportId,
    type: ViewportType.PLANAR_NEXT,
    element: secondElement,
    defaultOptions: {
      orientation: OrientationAxis.AXIAL,
    },
  });

  expect(recorder.count(Events.ELEMENT_ENABLED)).toBe(2);

  recorder.clear();
  ctx.renderingEngine.destroy();

  expect(recorder.count(Events.ELEMENT_DISABLED)).toBe(2);
  expect(recorder.count(Events.ELEMENT_ENABLED)).toBe(0);

  const disabledViewportIds = recorder.events
    .filter((event) => event.type === Events.ELEMENT_DISABLED)
    .map((event) => (event.detail as ElementLifecycleDetail | undefined)?.viewportId)
    .sort();

  expect(disabledViewportIds).toEqual(
    [ctx.viewportId, secondViewportId].sort()
  );

  if (secondElement.parentNode) {
    secondElement.parentNode.removeChild(secondElement);
  }
});

// ==========================================================================
// 2. Exactly-once semantics for a discrete camera operation
// ==========================================================================

test('setZoom from steady state fires CAMERA_MODIFIED exactly once', async () => {
  const ctx = await setupViewport();
  const { viewport, element } = ctx;

  const recorder = recordEvents(element, ALL_TRACKED_EVENTS);
  track(recorder.stop);

  // Steady state: wait for two consecutive animation frames with no new
  // events before starting the measured operation.
  await waitForQuiescence(recorder);
  recorder.clear();

  viewport.setZoom(2);
  viewport.render();
  await recorder.waitFor(Events.IMAGE_RENDERED);
  await waitForQuiescence(recorder);

  // Observed on a stable run: exactly 1. setZoom -> setScale ->
  // applyResolvedViewState -> GenericViewport.modified(previousCamera),
  // which fires triggerCameraModifiedEvent synchronously exactly once; the
  // render() call in the same modified() only schedules a frame and does
  // not itself fire another CAMERA_MODIFIED.
  expect(recorder.count(Events.CAMERA_MODIFIED)).toBe(1);

  const cameraEvent = recorder.events.find(
    (event) => event.type === Events.CAMERA_MODIFIED
  );
  const cameraDetail = cameraEvent?.detail as CameraModifiedDetail | undefined;

  expect(cameraDetail?.viewportId).toBe(ctx.viewportId);
  expect(cameraDetail?.renderingEngineId).toBe(ctx.renderingEngine.id);
  expect(viewport.getZoom()).toBeCloseTo(2, 5);
});

// ==========================================================================
// 3. Render coalescing under a burst
// ==========================================================================

test('a synchronous burst of setPan calls coalesces IMAGE_RENDERED and applies last-write-wins', async () => {
  const ctx = await setupViewport();
  const { viewport, element } = ctx;

  const recorder = recordEvents(element, ALL_TRACKED_EVENTS);
  track(recorder.stop);

  await waitForQuiescence(recorder);
  recorder.clear();

  for (let i = 1; i <= 20; i++) {
    viewport.setPan([i, i]);
  }

  await recorder.waitFor(Events.IMAGE_RENDERED);
  await waitForQuiescence(recorder);

  // The rendering engine coalesces every render() request made before the
  // next animation frame fires into a single RAF callback
  // (BaseRenderingEngine._setViewportsToBeRenderedNextFrame /
  // _render), so a synchronous burst of 20 renders must not produce 20
  // IMAGE_RENDERED events.
  expect(recorder.count(Events.IMAGE_RENDERED)).toBeGreaterThanOrEqual(1);
  expect(recorder.count(Events.IMAGE_RENDERED)).toBeLessThanOrEqual(3);

  const [panX, panY] = viewport.getPan();
  expect(panX).toBeCloseTo(20, 2);
  expect(panY).toBeCloseTo(20, 2);
});

// ==========================================================================
// 4. Golden event sequence for the canonical flow
// ==========================================================================

test('golden event sequence for load -> scroll -> zoom', async () => {
  // ELEMENT_ENABLED fires synchronously inside createPlanarViewport, before
  // this test can attach a listener to `eventTarget` (there is no `await`
  // in the harness before that call even in the skipDisplaySets branch), so
  // it is verified precisely by test 1 above and intentionally left out of
  // this sequence; the harness cannot be edited to expose an earlier hook.
  const ctx = await createPlanarViewport({ skipDisplaySets: true });
  track(ctx.cleanup);

  const { viewport, element } = ctx;
  const recorder = recordEvents(element, ALL_TRACKED_EVENTS);
  track(recorder.stop);

  // -- load: setDisplaySets + first render --
  utilities.genericViewportDisplaySetMetadataProvider.add(ctx.displaySetId, {
    imageIds: ctx.imageIds,
    kind: 'planar',
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({
    displaySetId: ctx.displaySetId,
    options: { orientation: OrientationAxis.AXIAL },
  });
  await renderAndWait(element, viewport);
  await waitForQuiescence(recorder);

  // -- scroll(1) --
  await viewport.scroll(1);
  await waitForQuiescence(recorder);

  // -- setZoom(2) + render --
  viewport.setZoom(2);
  viewport.render();
  await waitForQuiescence(recorder);

  const observedSequence = recorder.types();

  // Golden contract, pinned from an actual run (verified stable across
  // repeated runs of this file). No collapsing of consecutive duplicates
  // was needed -- none occurred. Ordering, per step:
  //   load:   STACK_NEW_IMAGE fires first (the vtkImage mount fires the
  //           initial slice synchronously while building the binding),
  //           then VOI_MODIFIED (addDisplaySetInternal mirrors legacy
  //           StackViewport by emitting the resolved default VOI right
  //           after `setDefaultDataPresentation`), then CAMERA_MODIFIED
  //           (the source-binding's initial camera, emitted directly by
  //           addDisplaySetInternal), then IMAGE_RENDERED (the RAF
  //           callback fires after the mount's render() request).
  //   scroll: CAMERA_MODIFIED fires synchronously inside setViewState's
  //           modified() before the image-loader microtask resolves;
  //           STACK_NEW_IMAGE then fires once the new slice's image
  //           promise resolves and swaps the actor; IMAGE_RENDERED follows
  //           on the next animation frame.
  //   zoom:   CAMERA_MODIFIED (synchronous) then IMAGE_RENDERED (next
  //           frame).
  const golden = [
    Events.STACK_NEW_IMAGE,
    Events.VOI_MODIFIED,
    Events.CAMERA_MODIFIED,
    Events.IMAGE_RENDERED,
    Events.CAMERA_MODIFIED,
    Events.STACK_NEW_IMAGE,
    Events.IMAGE_RENDERED,
    Events.CAMERA_MODIFIED,
    Events.IMAGE_RENDERED,
  ];

  // Stabilization rule (b) from the plan: assert the golden array as an
  // ordered subsequence of the observed sequence, so extra (but not
  // out-of-order or missing) events do not break the contract.
  let cursor = 0;
  for (const expectedType of golden) {
    const foundIndex = observedSequence.indexOf(expectedType, cursor);

    expect(
      foundIndex,
      `expected "${expectedType}" at-or-after position ${cursor} in observed sequence ${JSON.stringify(
        observedSequence
      )}`
    ).toBeGreaterThanOrEqual(0);

    cursor = foundIndex + 1;
  }
});

// ==========================================================================
// 5. New-image event on scroll
// ==========================================================================

test('scroll fires exactly one new-image event whose imageId matches the resolved slice', async () => {
  const ctx = await setupViewport();
  const { viewport, element, imageIds } = ctx;

  const recorder = recordEvents(element, ALL_TRACKED_EVENTS);
  track(recorder.stop);

  await waitForQuiescence(recorder);
  recorder.clear();

  const resolvedImageId = await viewport.scroll(1);
  await recorder.waitFor(Events.STACK_NEW_IMAGE);
  await waitForQuiescence(recorder);

  expect(recorder.count(Events.STACK_NEW_IMAGE)).toBe(1);
  expect(recorder.count(Events.VOLUME_NEW_IMAGE)).toBe(0);

  const newImageEvent = recorder.events.find(
    (event) => event.type === Events.STACK_NEW_IMAGE
  );
  const detail = newImageEvent?.detail as StackNewImageDetail | undefined;

  expect(resolvedImageId).toBe(imageIds[1]);
  expect(viewport.getCurrentImageId()).toBe(imageIds[1]);
  expect(detail?.imageId).toBe(viewport.getCurrentImageId());
  expect(detail?.imageIdIndex).toBe(1);
  expect(detail?.viewportId).toBe(ctx.viewportId);
});

// ==========================================================================
// 6. VOI event
// ==========================================================================

test('setDisplaySetPresentation with a new voiRange fires VOI_MODIFIED with the new range', async () => {
  const ctx = await setupViewport();
  const { viewport, element, displaySetId } = ctx;

  const recorder = recordEvents(element, ALL_TRACKED_EVENTS);
  track(recorder.stop);

  await waitForQuiescence(recorder);
  recorder.clear();

  const nextRange = { lower: 0, upper: 100 };
  viewport.setDisplaySetPresentation(displaySetId, { voiRange: nextRange });
  viewport.render();
  await waitForQuiescence(recorder);

  expect(recorder.count(Events.VOI_MODIFIED)).toBeGreaterThanOrEqual(1);

  const voiEvent = recorder.events.find(
    (event) => event.type === Events.VOI_MODIFIED
  );
  const detail = voiEvent?.detail as VoiModifiedDetail | undefined;

  expect(detail?.viewportId).toBe(ctx.viewportId);
  expect(detail?.range).toEqual(nextRange);
  expect(viewport.getDisplaySetPresentation(displaySetId)?.voiRange).toEqual(
    nextRange
  );
});

// Finding: `GenericViewport.mergeDataPresentation` -> `notifyDataPresentationModified`
// fires VOI_MODIFIED whenever the merged props touch `voiRange` (see
// PlanarViewport.ts around the `notifyDataPresentationModified` override), with
// no comparison against the previously-stored value. Setting the exact same
// VOI range a second time therefore fires VOI_MODIFIED again instead of being
// a no-op. This is marked `test.fails` per shared-context rule 5 rather than
// weakened, so a future fix that makes the no-op case silent will flip this
// test to failing-when-it-should-pass and be caught.
test.fails(
  'setting the same voiRange again is a no-op and must not fire VOI_MODIFIED (known divergence)',
  async () => {
    const ctx = await setupViewport();
    const { viewport, element, displaySetId } = ctx;

    const recorder = recordEvents(element, ALL_TRACKED_EVENTS);
    track(recorder.stop);

    const sameRange = { lower: 0, upper: 100 };
    viewport.setDisplaySetPresentation(displaySetId, { voiRange: sameRange });
    viewport.render();
    await waitForQuiescence(recorder);

    recorder.clear();

    // Re-apply the exact same range: observed behavior fires VOI_MODIFIED
    // again (count becomes 1, not 0), which is the divergence this test
    // documents.
    viewport.setDisplaySetPresentation(displaySetId, { voiRange: sameRange });
    viewport.render();
    await waitForQuiescence(recorder);

    expect(recorder.count(Events.VOI_MODIFIED)).toBe(0);
  }
);

// ==========================================================================
// 7. Silence after destroy
// ==========================================================================

test('no tracked events fire after the final ELEMENT_DISABLED', async () => {
  const ctx = await setupViewport();
  const { viewport, element, renderingEngine } = ctx;

  const elementRecorder = recordEvents(element, ALL_TRACKED_EVENTS);
  const globalRecorder = recordEvents(eventTarget, [
    Events.ELEMENT_ENABLED,
    Events.ELEMENT_DISABLED,
  ]);
  track(elementRecorder.stop);
  track(globalRecorder.stop);

  await waitForQuiescence(elementRecorder);

  renderingEngine.destroy();

  expect(globalRecorder.count(Events.ELEMENT_DISABLED)).toBe(1);

  elementRecorder.clear();
  globalRecorder.clear();

  window.dispatchEvent(new Event('resize'));

  try {
    viewport.render();
  } catch {
    // A post-destroy render() is expected to be inert (see
    // PlanarViewport.render()'s `isDestroyed` guard); if it throws instead,
    // that is tolerated here since this test only asserts no *events* leak,
    // not that render() itself is side-effect-free.
  }

  // ~200ms via animation frames, per the plan's timing-discipline section,
  // rather than an arbitrary setTimeout sleep.
  await waitAnimationFrames(12);

  expect(elementRecorder.events).toEqual([]);
  expect(globalRecorder.events).toEqual([]);
});
