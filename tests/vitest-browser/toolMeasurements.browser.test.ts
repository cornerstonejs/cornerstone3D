// State-based tests driving @cornerstonejs/tools annotation tools with
// synthetic pointer events against the shared harness's deterministic fake
// stack, asserting on annotation STATE (world coordinates, cachedStats)
// against closed-form expected values. No pixels.
//
// Input synthesis mirrors packages/tools/test/LengthTool_test.js exactly:
// a native `mousedown` dispatched on the viewport element followed by a
// `mousemove` + `mouseup` dispatched on `document` (mirroring
// packages/tools/src/eventListeners/mouse/mouseDownListener.ts, which adds
// its move/up listeners to `document`, not the element), all carrying
// `buttons: 1` while the button is logically down. Coordinates are derived
// from the target canvas point plus `element.getBoundingClientRect()`,
// matching how `getMouseEventPoints` (same file) recovers canvas coordinates
// from `clientX`/`clientY`. Canvas points are rounded to integers before
// dispatch (same reason as the Karma tests' `createNormalizedMouseEvent`:
// client/page coordinates round-trip cleanly only at integer canvas pixels),
// and every expected value used in assertions is derived from the SAME
// rounded canvas point via `viewport.canvasToWorld`, so rounding cannot
// introduce a mismatch between what was dispatched and what is asserted.
import { afterEach, describe, expect, test } from 'vitest';
import type { Types } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createPlanarViewport,
  renderAndWait,
  type PlanarViewportContext,
} from './harness';

const { LengthTool, RectangleROITool, ToolGroupManager, annotation } =
  cornerstoneTools;
const { Events: ToolsEvents, MouseBindings } = cornerstoneTools.Enums;
const { filterAnnotationsForDisplay } = cornerstoneTools.utilities.planar;

function round2(point: Types.Point2): [number, number] {
  return [Math.round(point[0]), Math.round(point[1])];
}

function distance3(a: Types.Point3, b: Types.Point3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clientPointFromCanvasPoint(
  element: HTMLDivElement,
  canvasPoint: [number, number]
): [number, number] {
  // Mirrors getMouseEventPoints' `_pagePointsToCanvasPoints`, which recovers
  // the canvas point from clientX/clientY using the viewport element's (not
  // the inner canvas') bounding rect -- inverted here to go canvas -> client.
  const rect = element.getBoundingClientRect();
  return [canvasPoint[0] + rect.left, canvasPoint[1] + rect.top];
}

function dispatchMouseDown(
  element: HTMLDivElement,
  canvasPoint: [number, number]
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(element, canvasPoint);
  element.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
      clientX,
      clientY,
    })
  );
}

function dispatchMouseMove(
  element: HTMLDivElement,
  canvasPoint: [number, number]
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(element, canvasPoint);
  document.dispatchEvent(
    new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 1,
      clientX,
      clientY,
    })
  );
}

function dispatchMouseUp(
  element: HTMLDivElement,
  canvasPoint: [number, number]
): void {
  const [clientX, clientY] = clientPointFromCanvasPoint(element, canvasPoint);
  document.dispatchEvent(
    new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      buttons: 0,
      clientX,
      clientY,
    })
  );
}

/**
 * Draws an annotation via a synthetic pointer drag from p1 to p2 (canvas
 * coordinates, rounded to integers -- see file header). Resolves once the
 * tools' AnnotationRenderingEngine has completed a render pass following the
 * draw: cachedStats are computed inside each tool's `renderAnnotation`
 * (requestAnimationFrame-driven, see AnnotationRenderingEngine.ts), which
 * fires strictly after ANNOTATION_COMPLETED/ANNOTATION_MODIFIED (both
 * dispatched synchronously inside the mouse-up handler, before that RAF), so
 * ANNOTATION_RENDERED is the only event that reliably gates cachedStats
 * being populated. This matches what packages/tools/test/LengthTool_test.js
 * actually waits on.
 */
async function drawAnnotationByDrag(
  element: HTMLDivElement,
  p1: [number, number],
  p2: [number, number]
): Promise<{ p1: [number, number]; p2: [number, number] }> {
  const roundedP1 = round2(p1);
  const roundedP2 = round2(p2);

  const rendered = new Promise<void>((resolve) => {
    element.addEventListener(
      ToolsEvents.ANNOTATION_RENDERED,
      () => resolve(),
      { once: true }
    );
  });

  dispatchMouseDown(element, roundedP1);
  dispatchMouseMove(element, roundedP2);
  dispatchMouseUp(element, roundedP2);

  await rendered;

  return { p1: roundedP1, p2: roundedP2 };
}

interface ToolTestSetup {
  ctx: PlanarViewportContext;
  toolGroupId: string;
}

let active: ToolTestSetup | null = null;

/**
 * Boots @cornerstonejs/tools against a fresh harness viewport: init(),
 * addTool, a dedicated tool group (one per test, keyed by the harness's
 * unique viewportId so parallel afterEach failures cannot collide), the
 * requested tool bound to the primary mouse button, and the viewport
 * attached to the group. Mirrors the incantation from
 * packages/tools/test/LengthTool_test.js / utils/test/testUtils.js
 * `setupTestEnvironment`.
 */
async function setupToolTest(
  toolClass: { toolName: string },
  createOpts?: Parameters<typeof createPlanarViewport>[0]
): Promise<ToolTestSetup> {
  // cornerstoneTools.init() MUST run before createPlanarViewport(): tools
  // wires its mouse/keyboard listeners onto the viewport element from an
  // ELEMENT_ENABLED listener registered by init() (see
  // packages/tools/src/init.ts + store/addEnabledElement.ts). enableElement()
  // (inside createPlanarViewport) fires ELEMENT_ENABLED synchronously, so
  // initializing tools afterwards misses that event entirely and the element
  // ends up with no tools event listeners at all (mousedown/mousemove
  // dispatch silently does nothing). Mirrors utils/test/testUtils.js
  // `setupTestEnvironment`, which always calls initTools() before any
  // viewport is created.
  cornerstoneTools.init();
  cornerstoneTools.addTool(toolClass);

  const ctx = await createPlanarViewport(createOpts);

  const toolGroupId = `vitest-tool-measurements:${ctx.viewportId}`;
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  if (!toolGroup) {
    ctx.cleanup();
    throw new Error(`Failed to create tool group ${toolGroupId}`);
  }

  toolGroup.addTool(toolClass.toolName);
  toolGroup.addViewport(ctx.viewportId, ctx.renderingEngine.id);
  toolGroup.setToolActive(toolClass.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  active = { ctx, toolGroupId };
  return active;
}

afterEach(() => {
  if (!active) {
    return;
  }

  const { ctx, toolGroupId } = active;
  active = null;

  // Tear down tools state (tool group, global tool registry, event
  // listeners, annotation manager) BEFORE the harness destroys the
  // rendering engine/element, so tools' own element-scoped listener
  // removal (mouseEventListeners.disable, etc.) still has a live element.
  ToolGroupManager.destroyToolGroup(toolGroupId);
  cornerstoneTools.destroy();
  ctx.cleanup();
});

describe('toolMeasurements', () => {
  test('Length tool measures exactly', async () => {
    const { ctx } = await setupToolTest(LengthTool);
    const { viewport, element } = ctx;

    const p1: [number, number] = [100, 200];
    const p2: [number, number] = [200, 200];

    await drawAnnotationByDrag(element, p1, p2);

    const lengthAnnotations = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );

    expect(lengthAnnotations).toBeDefined();
    expect(lengthAnnotations.length).toBe(1);

    const lengthAnnotation = lengthAnnotations[0];
    const expectedWorld1 = viewport.canvasToWorld(p1);
    const expectedWorld2 = viewport.canvasToWorld(p2);

    const handlePoints = lengthAnnotation.data.handles.points;
    expect(handlePoints.length).toBe(2);

    expect(handlePoints[0][0]).toBeCloseTo(expectedWorld1[0], 2);
    expect(handlePoints[0][1]).toBeCloseTo(expectedWorld1[1], 2);
    expect(handlePoints[0][2]).toBeCloseTo(expectedWorld1[2], 2);
    expect(handlePoints[1][0]).toBeCloseTo(expectedWorld2[0], 2);
    expect(handlePoints[1][1]).toBeCloseTo(expectedWorld2[1], 2);
    expect(handlePoints[1][2]).toBeCloseTo(expectedWorld2[2], 2);

    const cachedStats = lengthAnnotation.data.cachedStats;
    const targetIds = Object.keys(cachedStats);
    expect(targetIds.length).toBe(1);

    const expectedLength = distance3(expectedWorld1, expectedWorld2);
    expect(cachedStats[targetIds[0]].length).toBeCloseTo(expectedLength, 3);
  });

  test('annotation survives navigation state changes', async () => {
    const { ctx } = await setupToolTest(LengthTool);
    const { viewport, element } = ctx;

    const p1: [number, number] = [100, 200];
    const p2: [number, number] = [200, 200];

    await drawAnnotationByDrag(element, p1, p2);

    const lengthAnnotations = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(lengthAnnotations.length).toBe(1);

    const lengthAnnotation = lengthAnnotations[0];
    const preNavHandles = lengthAnnotation.data.handles.points.map(
      (point: Types.Point3) => [...point] as Types.Point3
    );

    viewport.setZoom(2);
    viewport.setPan([15, 5]);
    await renderAndWait(element, viewport);

    // Annotations are world-anchored: canvas projection changes with
    // zoom/pan, but the stored WORLD coordinates must not.
    const postNavHandles = lengthAnnotation.data.handles.points;
    expect(postNavHandles.length).toBe(preNavHandles.length);

    for (let i = 0; i < preNavHandles.length; i++) {
      expect(postNavHandles[i][0]).toBeCloseTo(preNavHandles[i][0], 3);
      expect(postNavHandles[i][1]).toBeCloseTo(preNavHandles[i][1], 3);
      expect(postNavHandles[i][2]).toBeCloseTo(preNavHandles[i][2], 3);
    }

    expect(viewport.getZoom()).toBeCloseTo(2, 6);
  });

  test('length across slices is slice-bound', async () => {
    const { ctx } = await setupToolTest(LengthTool);
    const { viewport, element, imageIds } = ctx;

    expect(viewport.getCurrentImageIdIndex()).toBe(0);

    const p1: [number, number] = [100, 200];
    const p2: [number, number] = [200, 200];

    await drawAnnotationByDrag(element, p1, p2);

    const allAnnotations = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(allAnnotations.length).toBe(1);

    const drawnAnnotation = allAnnotations[0];
    expect(drawnAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

    // Still on slice 0: the annotation must be filterable-in.
    const filteredAtSlice0 = filterAnnotationsForDisplay(
      viewport,
      allAnnotations
    );
    expect(filteredAtSlice0.map((a) => a.annotationUID)).toContain(
      drawnAnnotation.annotationUID
    );

    // Navigate to slice 2: the slice-0 annotation must NOT be viewable here.
    await viewport.setImageIdIndex(2);
    expect(viewport.getCurrentImageIdIndex()).toBe(2);

    const filteredAtSlice2 = filterAnnotationsForDisplay(
      viewport,
      annotation.state.getAnnotations(LengthTool.toolName, element)
    );
    expect(filteredAtSlice2.map((a) => a.annotationUID)).not.toContain(
      drawnAnnotation.annotationUID
    );

    // Navigate back to slice 0: the annotation must be filterable-in again.
    await viewport.setImageIdIndex(0);
    expect(viewport.getCurrentImageIdIndex()).toBe(0);

    const filteredBackAtSlice0 = filterAnnotationsForDisplay(
      viewport,
      annotation.state.getAnnotations(LengthTool.toolName, element)
    );
    expect(filteredBackAtSlice0.map((a) => a.annotationUID)).toContain(
      drawnAnnotation.annotationUID
    );
  });

  describe('RectangleROI statistics (stretch)', () => {
    // World geometry (see harness/fakeImageStack.ts, DEFAULT_OPTIONS): 64x64,
    // 1mm spacing, identity orientation, imagePositionPatient=[0,0,sliceIndex]
    // -- so voxel (column i, row j) on slice 0 sits at world [i, j, 0]. The
    // vertical bar (pixel value 255) spans columns [20, 25); everything else
    // on slice 0 is background (value 10). Canvas points are derived FROM
    // these world targets via worldToCanvas (never hard-coded), each with a
    // full 1mm margin inside the region so a canvas-point-rounding error of
    // up to 0.5 canvas px (well under a world mm at this viewport's zoom)
    // cannot cross into the neighboring region.
    async function drawRectangleAndGetMean(
      ctx: PlanarViewportContext,
      worldP1: Types.Point3,
      worldP2: Types.Point3
    ): Promise<number> {
      const { viewport, element } = ctx;
      const canvasP1 = viewport.worldToCanvas(worldP1);
      const canvasP2 = viewport.worldToCanvas(worldP2);

      await drawAnnotationByDrag(
        element,
        [canvasP1[0], canvasP1[1]],
        [canvasP2[0], canvasP2[1]]
      );

      const roiAnnotations = annotation.state.getAnnotations(
        RectangleROITool.toolName,
        element
      );
      expect(roiAnnotations.length).toBe(1);

      const cachedStats = roiAnnotations[0].data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);

      return cachedStats[targetIds[0]].mean;
    }

    test('rectangle entirely inside the bar has mean 255', async () => {
      const { ctx } = await setupToolTest(RectangleROITool);

      const mean = await drawRectangleAndGetMean(
        ctx,
        [21, 10, 0],
        [24, 50, 0]
      );

      expect(mean).toBe(255);
    });

    test('rectangle entirely in the background has mean 10', async () => {
      const { ctx } = await setupToolTest(RectangleROITool);

      const mean = await drawRectangleAndGetMean(
        ctx,
        [40, 10, 0],
        [50, 50, 0]
      );

      expect(mean).toBe(10);
    });
  });
});
