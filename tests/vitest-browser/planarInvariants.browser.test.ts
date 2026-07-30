// Round-trip and fixed-point invariant tests for PlanarViewport (GenericViewport
// architecture). These assert geometric/API contracts that must hold
// regardless of which render path is active. Default renderMode is
// 'vtkImage' with the harness's default 5-slice fake stack, per the plan.
//
// See plans/vitest-browser-state-tests/02-roundtrip-invariants.md.

import { afterEach, describe, expect, test } from 'vitest';
import {
  Enums,
  RenderingEngine,
  utilities,
  type PlanarViewport,
  type Types,
} from '@cornerstonejs/core';
import {
  createPlanarViewport,
  renderAndWait,
  round6,
  type PlanarViewportContext,
} from './harness';

const { InterpolationType, OrientationAxis, RenderBackend, ViewportType } = Enums;

// Per shared-context rule 6: canvas-px comparisons use ~1e-2 epsilon (we use
// 0.5px, matching the plan's explicit "within 0.5 canvas px" wording for the
// round-trip test); world-space (mm) comparisons use ~1e-3.
const CANVAS_PX_EPS = 0.5;
const WORLD_MM_EPS = 1e-3;

const GRID_COORDS = [50, 200, 350];
const GRID_POINTS: Array<[number, number]> = GRID_COORDS.flatMap((x) =>
  GRID_COORDS.map((y): [number, number] => [x, y])
);

let cleanups: Array<() => void> = [];

function track(ctx: PlanarViewportContext): PlanarViewportContext {
  cleanups.push(() => ctx.cleanup());
  return ctx;
}

afterEach(() => {
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

function toCanvasPoint(point: [number, number]): Types.Point2 {
  return point as unknown as Types.Point2;
}

function expectCanvasPointClose(
  actual: Types.Point2,
  expected: [number, number],
  eps: number = CANVAS_PX_EPS
) {
  expect(Math.abs(actual[0] - expected[0])).toBeLessThanOrEqual(eps);
  expect(Math.abs(actual[1] - expected[1])).toBeLessThanOrEqual(eps);
}

function expectWorldPointClose(
  actual: Types.Point3,
  expected: Types.Point3,
  eps: number = WORLD_MM_EPS
) {
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(eps);
  }
}

function assertCanvasWorldRoundTrip(
  viewport: PlanarViewport,
  points: Array<[number, number]>
) {
  for (const point of points) {
    const world = viewport.canvasToWorld(toCanvasPoint(point));
    const roundTripped = viewport.worldToCanvas(world);
    expectCanvasPointClose(roundTripped, point);
  }
}

/**
 * Local re-implementation of the harness's internal snapshot normalizer
 * (round every number, convert typed arrays, drop undefined-valued keys) so
 * getViewState() objects can be compared for the idempotency check in test 9
 * without editing harness files.
 */
function deepRound(value: unknown): unknown {
  if (typeof value === 'number') {
    return round6(value);
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>, (item) =>
      round6(item)
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepRound(item));
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(source)) {
      const normalized = deepRound(source[key]);

      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }

    return out;
  }

  return value;
}

describe('planarInvariants: canvasToWorld / worldToCanvas round trip', () => {
  test('holds across default fit, zoom, pan, rotation and flip+zoom configurations', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    // Configuration 1: default fit.
    assertCanvasWorldRoundTrip(viewport, GRID_POINTS);

    // Configuration 2: after setZoom(2).
    viewport.setZoom(2);
    await renderAndWait(element, viewport);
    assertCanvasWorldRoundTrip(viewport, GRID_POINTS);

    // Configuration 3: after setPan([30, -20]).
    viewport.setPan([30, -20]);
    await renderAndWait(element, viewport);
    assertCanvasWorldRoundTrip(viewport, GRID_POINTS);

    // Configuration 4: after setViewState({ rotation: 90 }).
    viewport.setViewState({ rotation: 90 });
    await renderAndWait(element, viewport);
    assertCanvasWorldRoundTrip(viewport, GRID_POINTS);

    // Configuration 5: after setViewState({ flipHorizontal: true }) combined
    // with zoom 1.5.
    viewport.setViewState({ flipHorizontal: true });
    viewport.setZoom(1.5);
    await renderAndWait(element, viewport);
    assertCanvasWorldRoundTrip(viewport, GRID_POINTS);
  });
});

describe('planarInvariants: fixed point under zoom at a canvas point', () => {
  test('setScaleAtCanvasPoint keeps the world point under the canvas point fixed', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;
    const canvasPoint = toCanvasPoint([100, 150]);

    const worldBefore = viewport.canvasToWorld(canvasPoint);

    viewport.setScaleAtCanvasPoint(2, canvasPoint);
    await renderAndWait(element, viewport);

    const worldAfter = viewport.canvasToWorld(canvasPoint);
    expectWorldPointClose(worldAfter, worldBefore, 1e-2);
  });

  test('setZoom(zoom, canvasPoint) keeps the world point under the canvas point fixed (fresh fit state)', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;
    const canvasPoint = toCanvasPoint([100, 150]);

    // Fresh fit state (this is the initial state right after mount, but
    // resetViewState() is called explicitly to document that the assertion
    // is meant to start from a known-fit baseline).
    viewport.resetViewState();
    await renderAndWait(element, viewport);

    const worldBefore = viewport.canvasToWorld(canvasPoint);

    // setZoom's optional canvasPoint argument: read around
    // Planar/PlanarViewport.ts:1067 (setZoom delegates to setScale) and
    // :1122 (setScaleAtCanvasPoint). Both ultimately call
    // PlanarResolvedView.withScale(nextScale, canvasPoint), which anchors the
    // world point under canvasPoint before rescaling -- i.e. setZoom's
    // canvasPoint semantics are identical to setScaleAtCanvasPoint's when a
    // resolved view is present (true here, since the viewport has already
    // rendered). No divergence was found between the two methods.
    viewport.setZoom(3, canvasPoint);
    await renderAndWait(element, viewport);

    const worldAfter = viewport.canvasToWorld(canvasPoint);
    expectWorldPointClose(worldAfter, worldBefore, 1e-2);
  });
});

describe('planarInvariants: rotation preserves the anchor', () => {
  test('rotating about the canvas center leaves the center world point unchanged', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;
    const canvasCenter = toCanvasPoint([200, 200]);

    const worldBefore = viewport.canvasToWorld(canvasCenter);

    viewport.setViewState({ rotation: 90 });
    await renderAndWait(element, viewport);

    const worldAfter = viewport.canvasToWorld(canvasCenter);
    expectWorldPointClose(worldAfter, worldBefore, 1e-2);
    expect(round6(viewport.getRotation())).toBe(90);
  });
});

describe('planarInvariants: setter/getter symmetry', () => {
  test('setZoom / getZoom', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    viewport.setZoom(2);
    await renderAndWait(element, viewport);

    expect(round6(viewport.getZoom())).toBe(2);
  });

  test('setPan / getPan', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    viewport.setPan([25, -10]);
    await renderAndWait(element, viewport);

    const pan = viewport.getPan();
    expect(round6(pan[0])).toBeCloseTo(25, 2);
    expect(round6(pan[1])).toBeCloseTo(-10, 2);
  });

  test('setImageIdIndex / getCurrentImageIdIndex / getSliceIndex', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    await viewport.setImageIdIndex(3);
    await renderAndWait(element, viewport);

    expect(viewport.getCurrentImageIdIndex()).toBe(3);
    expect(viewport.getSliceIndex()).toBe(3);
  });

  test('setViewState({ rotation }) / getRotation', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    viewport.setViewState({ rotation: 45 });
    await renderAndWait(element, viewport);

    expect(round6(viewport.getRotation())).toBe(45);
  });

  test('setViewState({ flipHorizontal }) / getViewState().flipHorizontal', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    viewport.setViewState({ flipHorizontal: true });
    await renderAndWait(element, viewport);

    expect(viewport.getViewState().flipHorizontal).toBe(true);
  });
});

describe('planarInvariants: view reference round trip (same viewport)', () => {
  test('setViewReference restores the navigated slice after scrolling away', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    await viewport.setImageIdIndex(3);
    await renderAndWait(element, viewport);

    const ref = viewport.getViewReference();
    expect(viewport.isReferenceViewable(ref)).toBeTruthy();

    await viewport.setImageIdIndex(0);
    await renderAndWait(element, viewport);
    expect(viewport.getSliceIndex()).toBe(0);

    viewport.setViewReference(ref);
    await renderAndWait(element, viewport);

    expect(viewport.getSliceIndex()).toBe(3);
  });

  test('getViewReferenceId is stable within a state and changes across slices', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    await viewport.setImageIdIndex(3);
    await renderAndWait(element, viewport);

    // Read getPlanarViewReferenceId (Planar/planarViewReference.ts): for the
    // default vtkImage (image-path) render mode it returns
    // `imageId:${referencedImageId}`, which is a pure function of the current
    // slice's imageId, so it both encodes the slice and is stable when the
    // state does not change.
    const idAtSlice3First = viewport.getViewReferenceId();
    const idAtSlice3Second = viewport.getViewReferenceId();
    expect(idAtSlice3Second).toBe(idAtSlice3First);

    await viewport.setImageIdIndex(1);
    await renderAndWait(element, viewport);

    const idAtSlice1 = viewport.getViewReferenceId();
    expect(idAtSlice1).not.toBe(idAtSlice3First);
  });
});

describe('planarInvariants: cross-viewport reference (same frame of reference)', () => {
  test('a view reference captured on viewport A is viewable and restorable on viewport B', async () => {
    const a = track(await createPlanarViewport());

    // Manually create a second viewport following the harness's own
    // construction pattern (see createPlanarViewport.ts), reusing viewport
    // A's already-registered fake stack and displaySetId so both viewports
    // resolve the same frameOfReferenceUID and imageIds without registering
    // a second fake stack.
    const renderingEngineIdB = `vitest-planar-invariants-cross-b-engine-${utilities.uuidv4()}`;
    const viewportIdB = `vitest-planar-invariants-cross-b-viewport-${utilities.uuidv4()}`;
    const renderingEngineB = new RenderingEngine(renderingEngineIdB);
    const elementB = document.createElement('div');
    elementB.dataset.testid = 'planar-invariants-cross-b';
    elementB.style.width = '400px';
    elementB.style.height = '400px';
    document.body.appendChild(elementB);

    cleanups.push(() => {
      renderingEngineB.destroy();

      if (elementB.parentNode) {
        elementB.parentNode.removeChild(elementB);
      }
    });

    renderingEngineB.enableElement({
      viewportId: viewportIdB,
      type: ViewportType.PLANAR_NEXT,
      element: elementB,
      defaultOptions: {
        orientation: OrientationAxis.AXIAL,
      },
    });

    const viewportB = renderingEngineB.getViewport<PlanarViewport>(viewportIdB);

    await viewportB.setDisplaySets({
      displaySetId: a.displaySetId,
      options: {
        orientation: OrientationAxis.AXIAL,
        renderBackend: RenderBackend.GPU,
      },
    });
    await renderAndWait(elementB, viewportB);

    await a.viewport.setImageIdIndex(4);
    await renderAndWait(a.element, a.viewport);

    const refA = a.viewport.getViewReference();

    // Read isPlanarReferenceViewable / isPlanarPlaneViewable
    // (Planar/planarViewReference.ts): a resolved planar view reference always
    // carries a `planeRestriction` populated from the CURRENT camera focal
    // point, so without `withNavigation: true` the check answers "is this
    // reference what I am currently displaying" (false here, since B is still
    // at its initial slice) rather than "could I navigate to display it".
    // `withNavigation: true` is the documented flag for the latter question,
    // which is what this test actually wants to assert before calling
    // setViewReference. This matches the legacy StackViewport.isReferenceViewable
    // contract, which is equally strict by default (see StackViewport.ts:3380).
    expect(
      viewportB.isReferenceViewable(refA, { withNavigation: true })
    ).toBeTruthy();

    viewportB.setViewReference(refA);
    await renderAndWait(elementB, viewportB);

    expect(viewportB.getSliceIndex()).toBe(4);
  });
});

describe('planarInvariants: scroll clamping at stack bounds', () => {
  test('scroll clamps at the first and last slice instead of wrapping', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport } = ctx;
    const lastSliceIndex = viewport.getNumberOfSlices() - 1;

    expect(viewport.getSliceIndex()).toBe(0);

    // PlanarViewport.scroll (Planar/PlanarViewport.ts:1394) delegates to
    // setImageIdIndex, which clamps the requested index into
    // [0, getMaxImageIdIndex()] via Math.min/Math.max -- i.e. scroll clamps
    // at the stack bounds; it does not wrap.
    await viewport.scroll(-3);
    expect(viewport.getSliceIndex()).toBe(0);

    await viewport.setImageIdIndex(lastSliceIndex);
    expect(viewport.getSliceIndex()).toBe(lastSliceIndex);

    await viewport.scroll(5);
    expect(viewport.getSliceIndex()).toBe(lastSliceIndex);
  });
});

describe('planarInvariants: presentation round trip', () => {
  test('setDisplaySetPresentation round-trips interpolationType and voiRange', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element, displaySetId } = ctx;

    const defaultsBeforeMutation = viewport.getDisplaySetPresentation(
      displaySetId
    );

    // Defaults captured right after mount: only the load-time `visible: true`
    // default is stored; interpolationType/voiRange overrides are unset
    // until explicitly requested (see GenericViewport.setDefaultDataPresentation
    // call in PlanarViewport.ts around line 441).
    expect(defaultsBeforeMutation?.interpolationType).toBeUndefined();
    expect(defaultsBeforeMutation?.voiRange).toBeUndefined();

    const nextVoiRange = { upper: 300, lower: -100 };
    viewport.setDisplaySetPresentation(displaySetId, {
      interpolationType: InterpolationType.NEAREST,
      voiRange: nextVoiRange,
    });
    await renderAndWait(element, viewport);

    const mutated = viewport.getDisplaySetPresentation(displaySetId);
    expect(mutated?.interpolationType).toBe(InterpolationType.NEAREST);
    expect(mutated?.voiRange).toEqual(nextVoiRange);

    viewport.resetDisplaySetPresentation(displaySetId);
    await renderAndWait(element, viewport);

    const afterReset = viewport.getDisplaySetPresentation(displaySetId);
    expect(afterReset?.interpolationType).toBe(
      defaultsBeforeMutation?.interpolationType
    );
    expect(afterReset?.voiRange).toEqual(defaultsBeforeMutation?.voiRange);
  });

  // Divergence found while implementing the above test: resetDisplaySetPresentation
  // (Planar/PlanarViewport.ts:1511) replaces the ENTIRE stored presentation
  // object with `{}` rather than restoring the pre-mutation snapshot. The
  // interpolationType/voiRange fields do return to their (undefined) default,
  // which is what the test above verifies, but any other field captured in
  // the pre-mutation snapshot -- notably `visible: true`, set once at mount
  // time via setDefaultDataPresentation -- is dropped too, so
  // getDisplaySetPresentation(displaySetId) does NOT deep-equal the
  // pre-mutation snapshot as a whole. Observed: defaultsBeforeMutation is
  // `{ visible: true }`; afterReset is `{}`. The method's own doc comment
  // frames this as intentional ("the next viewport intentionally has no
  // get/set Properties"), but it is still a real behavioral divergence from
  // a literal "reset restores defaults" contract, so it is kept here as a
  // documented test.fails rather than silently dropped or narrowed away.
  test.fails(
    'resetDisplaySetPresentation does not restore the full pre-mutation presentation snapshot (visible flag is lost)',
    async () => {
      const ctx = track(await createPlanarViewport());
      const { viewport, element, displaySetId } = ctx;

      const defaultsBeforeMutation = viewport.getDisplaySetPresentation(
        displaySetId
      );

      viewport.setDisplaySetPresentation(displaySetId, {
        interpolationType: InterpolationType.NEAREST,
        voiRange: { upper: 300, lower: -100 },
      });
      await renderAndWait(element, viewport);

      viewport.resetDisplaySetPresentation(displaySetId);
      await renderAndWait(element, viewport);

      const afterReset = viewport.getDisplaySetPresentation(displaySetId);
      expect(afterReset).toEqual(defaultsBeforeMutation);
    }
  );
});

describe('planarInvariants: view state round trip', () => {
  test('setViewState(getViewState()) is idempotent', async () => {
    const ctx = track(await createPlanarViewport());
    const { viewport, element } = ctx;

    // Exercise a non-default state first so the round trip is meaningful
    // (a purely default state could trivially round-trip even if setViewState
    // silently dropped fields).
    viewport.setZoom(1.75);
    viewport.setPan([12, -7]);
    viewport.setViewState({ rotation: 30, flipVertical: true });
    await renderAndWait(element, viewport);

    const vs = viewport.getViewState();
    const vsBefore = deepRound(vs);

    viewport.setViewState(vs);
    await renderAndWait(element, viewport);

    const vsAfter = deepRound(viewport.getViewState());

    expect(vsAfter).toEqual(vsBefore);
  });
});
