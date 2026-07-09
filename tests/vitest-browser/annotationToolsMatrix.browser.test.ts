// State-based coverage of one annotation tool per row of the plan 07 matrix,
// built on top of the tools harness (./harness/tools.ts). Extends, and does
// not duplicate, the proven coverage in toolMeasurements.browser.test.ts
// (Length + RectangleROI basics) -- that file is left untouched.
//
// For every tool: draw via synthetic pointer events, wait for
// ANNOTATION_RENDERED (the event that gates populated cachedStats -- see
// harness/tools.ts waitForAnnotationRendered), then assert annotation STATE
// (handle world coordinates, cachedStats) against closed-form expected
// values derived from the synthetic stack geometry (64x64, 1mm spacing,
// background value 10 + sliceIndex, vertical bar value 255 at world x in
// [20, 25)) via viewport.canvasToWorld/worldToCanvas -- never hard-coded
// world numbers.
//
// Black-box rule: only public @cornerstonejs/tools / @cornerstonejs/core
// exports, DOM, and events are used for assertions.
import { afterEach, describe, expect, test } from 'vitest';
import { eventTarget } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  mouseClick,
  mouseDrag,
  recordEvents,
  setupTools,
  waitForAnnotationRendered,
  worldDistance,
  type ToolsContext,
} from './harness';

const {
  ProbeTool,
  AngleTool,
  BidirectionalTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  LengthTool,
  annotation,
} = cornerstoneTools;
const { Events: ToolsEvents } = cornerstoneTools.Enums;

function round2(point: Types.Point2 | number[]): [number, number] {
  return [Math.round(point[0]), Math.round(point[1])];
}

let active: ToolsContext | null = null;

afterEach(() => {
  if (!active) {
    return;
  }

  const ctx = active;
  active = null;
  ctx.cleanup();
});

describe('annotationToolsMatrix', () => {
  describe('ProbeTool', () => {
    test('single click on the background reads the exact background value', async () => {
      const ctx = await setupTools({
        tools: [ProbeTool],
        activeTool: ProbeTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      // Canvas [200, 200] sits at the default fit-to-viewport zoom's image
      // center (~world [32, 32, 0]), well outside the bar (world x in
      // [20, 25)).
      const canvasPoint: [number, number] = [200, 200];

      const rendered = waitForAnnotationRendered(element);
      mouseClick(element, canvasPoint);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        ProbeTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const probeAnnotation = annotations[0];
      expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
      expect(probeAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

      const expectedWorld = viewport.canvasToWorld(round2(canvasPoint));
      const handlePoints = probeAnnotation.data.handles.points;
      expect(handlePoints.length).toBe(1);
      expect(handlePoints[0][0]).toBeCloseTo(expectedWorld[0], 2);
      expect(handlePoints[0][1]).toBeCloseTo(expectedWorld[1], 2);
      expect(handlePoints[0][2]).toBeCloseTo(expectedWorld[2], 2);

      const cachedStats = probeAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      expect(cachedStats[targetIds[0]].value).toBe(10);
    });

    test('single click inside the bar reads the exact bar value', async () => {
      const ctx = await setupTools({
        tools: [ProbeTool],
        activeTool: ProbeTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      const worldTarget: Types.Point3 = [22, 32, 0];
      const canvasPoint = round2(viewport.worldToCanvas(worldTarget));

      const rendered = waitForAnnotationRendered(element);
      mouseClick(element, canvasPoint);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        ProbeTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const probeAnnotation = annotations[0];
      expect(probeAnnotation.metadata.toolName).toBe(ProbeTool.toolName);
      expect(probeAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

      const expectedWorld = viewport.canvasToWorld(canvasPoint);
      const handlePoints = probeAnnotation.data.handles.points;
      expect(handlePoints[0][0]).toBeCloseTo(expectedWorld[0], 2);
      expect(handlePoints[0][1]).toBeCloseTo(expectedWorld[1], 2);
      expect(handlePoints[0][2]).toBeCloseTo(expectedWorld[2], 2);

      const cachedStats = probeAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      expect(cachedStats[targetIds[0]].value).toBe(255);
    });
  });

  describe('AngleTool', () => {
    // Interaction sequence learned from packages/tools/src/tools/annotation/AngleTool.ts
    // (no dedicated Karma test exists for this tool; CobbAngleTool_test.js
    // covers the unrelated 4-independent-point Cobb variant). AngleTool's
    // addNewAnnotation runs on the FIRST mousedown, placing 2 co-located
    // points (handles[0], handles[0]); the first mousedown+move+up gesture
    // drags handles[1] to the drag's endpoint and completes line 1 -- but
    // _endCallback special-cases `angleStartedNotYetCompleted &&
    // points.length === 2` to stay in draw mode (does NOT deactivate,
    // does NOT fire ANNOTATION_COMPLETED) instead of finishing. A SECOND
    // mousedown+move+up gesture then draws line 2: the second gesture's
    // mousedown is itself a no-op (addNewAnnotation early-returns while
    // angleStartedNotYetCompleted is true), but _activateDraw bound BOTH
    // Events.MOUSE_MOVE and Events.MOUSE_DRAG to the same handler during
    // gesture 1, so the second gesture's move+up still sets handles[2] and
    // completes the angle. Net effect: two mouseDrag calls in a row draw
    // one complete 3-point angle annotation: [handles[0], handles[1],
    // handles[2]].
    //
    // IMPORTANT: _calculateCachedStats computes
    // angleBetweenLines([handles[0], handles[1]], [handles[1], handles[2]]),
    // i.e. the shared vertex of the two lines -- the actual angle vertex --
    // is handles[1] (the END of the FIRST drag), not handles[0] (the first
    // drag's mousedown/start point). So to build a known angle at a chosen
    // vertex V with rays to points A and C, gesture 1 must drag FROM A TO V
    // (handles[0]=A, handles[1]=V), then gesture 2 drags to C
    // (handles[2]=C).
    test('two drags around a shared vertex form a 90 degree angle', async () => {
      const ctx = await setupTools({
        tools: [AngleTool],
        activeTool: AngleTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      const aWorld: Types.Point3 = [10, 30, 0];
      const vertexWorld: Types.Point3 = [30, 30, 0];
      const cWorld: Types.Point3 = [30, 10, 0];

      const aCanvas = round2(viewport.worldToCanvas(aWorld));
      const vertexCanvas = round2(viewport.worldToCanvas(vertexWorld));
      const cCanvas = round2(viewport.worldToCanvas(cWorld));

      mouseDrag(element, aCanvas, vertexCanvas);
      mouseDrag(element, vertexCanvas, cCanvas);
      await waitForAnnotationRendered(element);

      const annotations = annotation.state.getAnnotations(
        AngleTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const angleAnnotation = annotations[0];
      expect(angleAnnotation.metadata.toolName).toBe(AngleTool.toolName);
      expect(angleAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

      const handlePoints = angleAnnotation.data.handles.points;
      expect(handlePoints.length).toBe(3);

      const expectedA = viewport.canvasToWorld(aCanvas);
      const expectedVertex = viewport.canvasToWorld(vertexCanvas);
      const expectedC = viewport.canvasToWorld(cCanvas);
      const expectedPoints = [expectedA, expectedVertex, expectedC];

      for (let i = 0; i < 3; i++) {
        expect(handlePoints[i][0]).toBeCloseTo(expectedPoints[i][0], 2);
        expect(handlePoints[i][1]).toBeCloseTo(expectedPoints[i][1], 2);
        expect(handlePoints[i][2]).toBeCloseTo(expectedPoints[i][2], 2);
      }

      const cachedStats = angleAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      expect(cachedStats[targetIds[0]].angle).toBeCloseTo(90, 1);
    });

    test('two drags around a shared vertex form a 45 degree angle', async () => {
      const ctx = await setupTools({
        tools: [AngleTool],
        activeTool: AngleTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      // Same vertex/A as the 90 degree case; C moved so the angle between
      // (vertex->A) and (vertex->C) is 45 degrees:
      // u = A - vertex = (-20, 0), v = C - vertex = (-20, -20),
      // cos(theta) = (u.v)/(|u||v|) = 400 / (20 * 20*sqrt(2)) = 1/sqrt(2).
      const aWorld: Types.Point3 = [10, 30, 0];
      const vertexWorld: Types.Point3 = [30, 30, 0];
      const cWorld: Types.Point3 = [10, 10, 0];

      const aCanvas = round2(viewport.worldToCanvas(aWorld));
      const vertexCanvas = round2(viewport.worldToCanvas(vertexWorld));
      const cCanvas = round2(viewport.worldToCanvas(cWorld));

      mouseDrag(element, aCanvas, vertexCanvas);
      mouseDrag(element, vertexCanvas, cCanvas);
      await waitForAnnotationRendered(element);

      const annotations = annotation.state.getAnnotations(
        AngleTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const angleAnnotation = annotations[0];
      expect(angleAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

      const cachedStats = angleAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      expect(cachedStats[targetIds[0]].angle).toBeCloseTo(45, 1);
    });
  });

  describe('BidirectionalTool', () => {
    test('one drag draws a 20mm major axis with an auto-placed perpendicular minor axis', async () => {
      const ctx = await setupTools({
        tools: [BidirectionalTool],
        activeTool: BidirectionalTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      const p1World: Types.Point3 = [10, 40, 0];
      const p2World: Types.Point3 = [30, 40, 0]; // 20mm major axis
      const p1Canvas = round2(viewport.worldToCanvas(p1World));
      const p2Canvas = round2(viewport.worldToCanvas(p2World));

      const rendered = waitForAnnotationRendered(element);
      mouseDrag(element, p1Canvas, p2Canvas);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        BidirectionalTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const bidirectionalAnnotation = annotations[0];
      expect(bidirectionalAnnotation.metadata.toolName).toBe(
        BidirectionalTool.toolName
      );
      expect(bidirectionalAnnotation.metadata.referencedImageId).toBe(
        imageIds[0]
      );

      // handles.points = [majorStart, majorEnd, minorStart, minorEnd].
      // majorStart/majorEnd are the literal drag down/up points; the minor
      // axis is auto-generated perpendicular to the major axis at its
      // midpoint (see BidirectionalTool.ts), so it is checked below only
      // for self-consistency (length >= width) rather than against a
      // literal canvas input.
      const handlePoints = bidirectionalAnnotation.data.handles.points;
      expect(handlePoints.length).toBe(4);

      const expectedP1 = viewport.canvasToWorld(p1Canvas);
      const expectedP2 = viewport.canvasToWorld(p2Canvas);
      expect(handlePoints[0][0]).toBeCloseTo(expectedP1[0], 2);
      expect(handlePoints[0][1]).toBeCloseTo(expectedP1[1], 2);
      expect(handlePoints[0][2]).toBeCloseTo(expectedP1[2], 2);
      expect(handlePoints[1][0]).toBeCloseTo(expectedP2[0], 2);
      expect(handlePoints[1][1]).toBeCloseTo(expectedP2[1], 2);
      expect(handlePoints[1][2]).toBeCloseTo(expectedP2[2], 2);

      const cachedStats = bidirectionalAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      const stats = cachedStats[targetIds[0]];

      expect(stats.length).toBeCloseTo(20, 3);

      const selfConsistentWidth = worldDistance(
        handlePoints[2],
        handlePoints[3]
      );
      expect(stats.width).toBeCloseTo(selfConsistentWidth, 3);
      expect(stats.length).toBeGreaterThanOrEqual(stats.width);
    });
  });

  describe('RectangleROITool', () => {
    test('rectangle entirely in the background reports exact mean/stdDev/area', async () => {
      const ctx = await setupTools({
        tools: [RectangleROITool],
        activeTool: RectangleROITool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      // World footprint x in [30, 40], y in [10, 30]: entirely background
      // (bar is x in [20, 25)), area = 10 * 20 = 200mm^2.
      const p1World: Types.Point3 = [30, 10, 0];
      const p2World: Types.Point3 = [40, 30, 0];
      const p1Canvas = round2(viewport.worldToCanvas(p1World));
      const p2Canvas = round2(viewport.worldToCanvas(p2World));

      const rendered = waitForAnnotationRendered(element);
      mouseDrag(element, p1Canvas, p2Canvas);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        RectangleROITool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const rectAnnotation = annotations[0];
      expect(rectAnnotation.metadata.toolName).toBe(RectangleROITool.toolName);
      expect(rectAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

      // handles.points = [bottomLeft, bottomRight, topLeft, topRight] in the
      // tool's own canvas-space naming; only index 0 (drag-down) and index 3
      // (drag-up) are the literal input canvas points (see
      // RectangleROITool.ts addNewAnnotation handleIndex: 3 and the
      // handleIndex 0/3 branch of _dragCallback) -- 1 and 2 are derived
      // corners, verified only indirectly via the area assertion below.
      const handlePoints = rectAnnotation.data.handles.points;
      expect(handlePoints.length).toBe(4);

      const expectedP1 = viewport.canvasToWorld(p1Canvas);
      const expectedP2 = viewport.canvasToWorld(p2Canvas);
      expect(handlePoints[0][0]).toBeCloseTo(expectedP1[0], 2);
      expect(handlePoints[0][1]).toBeCloseTo(expectedP1[1], 2);
      expect(handlePoints[0][2]).toBeCloseTo(expectedP1[2], 2);
      expect(handlePoints[3][0]).toBeCloseTo(expectedP2[0], 2);
      expect(handlePoints[3][1]).toBeCloseTo(expectedP2[1], 2);
      expect(handlePoints[3][2]).toBeCloseTo(expectedP2[2], 2);

      const cachedStats = rectAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      const stats = cachedStats[targetIds[0]];

      expect(stats.mean).toBe(10);
      expect(stats.stdDev).toBe(0);
      expect(stats.area).toBeCloseTo(200, 2);
    });
  });

  describe('EllipticalROITool', () => {
    test('ellipse bounded by a 20mm square reports exact area/mean', async () => {
      const ctx = await setupTools({
        tools: [EllipticalROITool],
        activeTool: EllipticalROITool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element, imageIds } = ctx;

      // EllipticalROITool's draw drag is CENTER + offset (not opposite
      // bounding-box corners): dX/dY are computed as the absolute
      // canvas-space offset between the mousedown point and the current
      // drag point, independently per axis (see EllipticalROITool.ts
      // _dragDrawCallback). Dragging by equal world offsets in x and y
      // (+10, +10) therefore produces equal radii, i.e. a circle -- matching
      // the plan's "square-bounded" ellipse and its pi*10*10 expected area.
      const centerWorld: Types.Point3 = [40, 32, 0];
      const edgeWorld: Types.Point3 = [50, 42, 0];
      const centerCanvas = round2(viewport.worldToCanvas(centerWorld));
      const edgeCanvas = round2(viewport.worldToCanvas(edgeWorld));

      const rendered = waitForAnnotationRendered(element);
      mouseDrag(element, centerCanvas, edgeCanvas);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        EllipticalROITool.toolName,
        element
      );
      expect(annotations.length).toBe(1);

      const ellipseAnnotation = annotations[0];
      expect(ellipseAnnotation.metadata.toolName).toBe(
        EllipticalROITool.toolName
      );
      expect(ellipseAnnotation.metadata.referencedImageId).toBe(imageIds[0]);

      // handles.points = [bottom, top, left, right] of the ellipse, all
      // DERIVED from the drag's center+offset -- none are literally the
      // drag's down/up canvas points. At a ~6.25 canvas-px/mm default fit
      // zoom (400px viewport over a 64mm stack), independently rounding the
      // center and edge canvas points to integers (required for any
      // synthetic pointer dispatch, see harness/tools.ts) can shift a
      // ~62.5px radius by up to 1px (~1.6% on area) relative to the
      // idealized 10mm -- comfortably outside a literal 1% check on the
      // idealized value. Per 00-shared-context rule 6 and the reference
      // test's own approach, the expectation below is instead derived from
      // the SAME rounded canvas points via the tool's own documented
      // formula (EllipticalROITool.ts _dragDrawCallback: bottom/top/left/
      // right = centerCanvas +/- (dxCanvas, dyCanvas), each converted with
      // canvasToWorld), so rounding cannot introduce a mismatch; a separate,
      // looser assertion confirms the resulting radii still land within
      // about 2% of the plan's idealized 10mm.
      const dxCanvas = Math.abs(edgeCanvas[0] - centerCanvas[0]);
      const dyCanvas = Math.abs(edgeCanvas[1] - centerCanvas[1]);

      const expectedBottom = viewport.canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] - dyCanvas,
      ]);
      const expectedTop = viewport.canvasToWorld([
        centerCanvas[0],
        centerCanvas[1] + dyCanvas,
      ]);
      const expectedLeft = viewport.canvasToWorld([
        centerCanvas[0] - dxCanvas,
        centerCanvas[1],
      ]);
      const expectedRight = viewport.canvasToWorld([
        centerCanvas[0] + dxCanvas,
        centerCanvas[1],
      ]);
      const expectedHandles = [
        expectedBottom,
        expectedTop,
        expectedLeft,
        expectedRight,
      ];

      const handlePoints = ellipseAnnotation.data.handles.points;
      expect(handlePoints.length).toBe(4);

      for (let i = 0; i < 4; i++) {
        expect(handlePoints[i][0]).toBeCloseTo(expectedHandles[i][0], 2);
        expect(handlePoints[i][1]).toBeCloseTo(expectedHandles[i][1], 2);
        expect(handlePoints[i][2]).toBeCloseTo(expectedHandles[i][2], 2);
      }

      const [bottom, top, left, right] = handlePoints;
      const xRadius = worldDistance(left, right) / 2;
      const yRadius = worldDistance(bottom, top) / 2;
      expect(Math.abs(xRadius - 10) / 10).toBeLessThan(0.02);
      expect(Math.abs(yRadius - 10) / 10).toBeLessThan(0.02);

      const cachedStats = ellipseAnnotation.data.cachedStats;
      const targetIds = Object.keys(cachedStats);
      expect(targetIds.length).toBe(1);
      const stats = cachedStats[targetIds[0]];

      expect(stats.mean).toBe(10);
      // Self-consistency (per plan: "self-consistency" checks against the
      // annotation's own handle world points are sanctioned): the reported
      // area must match pi * (the ellipse's own, closed-form-verified,
      // handle-derived radii), independent of the idealized 10mm target.
      const expectedArea = Math.PI * xRadius * yRadius;
      expect(stats.area).toBeCloseTo(expectedArea, 1);
    });
  });

  describe('CircleROITool', () => {
    // COMPATIBILITY FINDING (see final report): CircleROITool cannot
    // complete its render pass on a direct (non-legacy-adapter)
    // GenericViewport/PlanarViewport, so ANNOTATION_RENDERED never fires and
    // this hangs until timeout. Root cause: CircleROITool.renderAnnotation
    // (packages/tools/src/tools/annotation/CircleROITool.ts:827) calls
    // getEllipseWorldCoordinates (packages/tools/src/utilities/
    // getEllipseWorldCoordinates.ts:31), which unconditionally calls
    // `viewport.getCamera()`. `getCamera` is NOT part of PlanarViewport's
    // API (packages/core/src/RenderingEngine/GenericViewport/Planar/
    // PlanarViewport.ts) -- it exists only on the separate
    // PlanarViewportLegacyAdapter subclass
    // (.../Planar/PlanarViewportLegacyAdapter.ts:49), which this harness
    // deliberately does not use (it opens ViewportType.PLANAR_NEXT
    // directly, the architecture under test for this whole campaign). The
    // resulting uncaught `TypeError: viewport.getCamera is not a function`
    // is thrown from inside the RAF-driven AnnotationRenderingEngine render
    // pass (see the "Unhandled Errors" section of a run of this file),
    // aborting that render pass before ANNOTATION_RENDERED fires -- observed
    // directly via a 5s timeout on `waitForAnnotationRendered` below,
    // shortened to 2s here since the outcome is already known. No other
    // tool in this matrix hits getEllipseWorldCoordinates (EllipticalROITool
    // uses its own, getCamera-free, center+offset formula), so this is
    // narrowly a CircleROITool-on-GenericViewport-Next incompatibility, not
    // a broader GenericViewport gap.
    test.fails(
      'circle drawn to a 10mm radius crashes the render pass via viewport.getCamera',
      async () => {
        const ctx = await setupTools({
          tools: [CircleROITool],
          activeTool: CircleROITool.toolName,
          viewport: { width: 400, height: 400 },
        });
        active = ctx;
        const { viewport, element } = ctx;

        const centerWorld: Types.Point3 = [45, 32, 0];
        const edgeWorld: Types.Point3 = [55, 32, 0];
        const centerCanvas = round2(viewport.worldToCanvas(centerWorld));
        const edgeCanvas = round2(viewport.worldToCanvas(edgeWorld));

        const rendered = waitForAnnotationRendered(element, {
          timeoutMs: 2000,
        });
        mouseDrag(element, centerCanvas, edgeCanvas);
        await rendered;
      }
    );
  });

  describe('LengthTool handle manipulation (extends toolMeasurements coverage)', () => {
    test('dragging an endpoint handle recomputes the length', async () => {
      const ctx = await setupTools({
        tools: [LengthTool],
        activeTool: LengthTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element } = ctx;

      const p1World: Types.Point3 = [10, 32, 0];
      const p2World: Types.Point3 = [30, 32, 0]; // 20mm
      const p1Canvas = round2(viewport.worldToCanvas(p1World));
      const p2Canvas = round2(viewport.worldToCanvas(p2World));

      let rendered = waitForAnnotationRendered(element);
      mouseDrag(element, p1Canvas, p2Canvas);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        LengthTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);
      const lengthAnnotation = annotations[0];

      // Expected length is derived from the SAME rounded canvas points used
      // for dispatch (see harness/tools.ts round-trip note), not the
      // idealized 20mm world delta: p1World/p2World do not necessarily land
      // on an exact integer canvas pixel at this viewport's fit-to-window
      // zoom, and canvasToWorld(round(worldToCanvas(x))) can differ from x
      // by a fraction of a canvas pixel, so asserting against the idealized
      // literal is not epsilon-safe at 1e-3 (see the analogous fix below,
      // where it was NOT safe).
      const expectedInitialLength = worldDistance(
        viewport.canvasToWorld(p1Canvas),
        viewport.canvasToWorld(p2Canvas)
      );
      const initialStats = lengthAnnotation.data.cachedStats;
      const initialTargetIds = Object.keys(initialStats);
      expect(initialStats[initialTargetIds[0]].length).toBeCloseTo(
        expectedInitialLength,
        3
      );
      // Sanity check (loose: canvas-pixel-rounding budget, see comment
      // above) that this is still testing the intended ~20mm scenario, not
      // a mistake elsewhere in the setup.
      expect(expectedInitialLength).toBeCloseTo(20, 0);

      // Grab the second handle (drawn at p2, world [30, 32, 0]) exactly at
      // its current canvas position -- proximity hit-testing on MOUSE_DOWN
      // resolves it to handleIndex 1 -- and drag it 10mm further along the
      // same direction, to world [40, 32, 0]: new length should be 30mm.
      // Interaction sequence learned from
      // packages/tools/test/LengthTool_test.js
      // "Should successfully create a length tool and modify its handle".
      const handleCanvas = round2(
        viewport.worldToCanvas(lengthAnnotation.data.handles.points[1])
      );
      const targetWorld: Types.Point3 = [40, 32, 0];
      const targetCanvas = round2(viewport.worldToCanvas(targetWorld));

      // ANNOTATION_MODIFIED is dispatched on @cornerstonejs/core's
      // `eventTarget` singleton, not on the viewport element (see
      // packages/tools/src/stateManagement/annotation/helpers/state.ts
      // triggerAnnotationModified: `triggerEvent(eventTarget, eventType,
      // ...)`) -- unlike ANNOTATION_RENDERED, which the AnnotationRendering
      // Engine fires on the element itself.
      const events = recordEvents(eventTarget, [
        ToolsEvents.ANNOTATION_MODIFIED,
      ]);
      rendered = waitForAnnotationRendered(element);
      mouseDrag(element, handleCanvas, targetCanvas);
      await rendered;
      events.stop();

      expect(events.count(ToolsEvents.ANNOTATION_MODIFIED)).toBeGreaterThanOrEqual(
        1
      );

      const expectedUpdatedLength = worldDistance(
        viewport.canvasToWorld(p1Canvas),
        viewport.canvasToWorld(targetCanvas)
      );
      const updatedStats = lengthAnnotation.data.cachedStats;
      const updatedTargetIds = Object.keys(updatedStats);
      expect(updatedTargetIds.length).toBe(1);
      expect(updatedStats[updatedTargetIds[0]].length).toBeCloseTo(
        expectedUpdatedLength,
        3
      );
      // Sanity check (loose: canvas-pixel-rounding budget) this is still
      // testing the intended ~30mm scenario.
      expect(expectedUpdatedLength).toBeCloseTo(30, 0);

      const expectedHandle = viewport.canvasToWorld(targetCanvas);
      const updatedHandlePoint = lengthAnnotation.data.handles.points[1];
      expect(updatedHandlePoint[0]).toBeCloseTo(expectedHandle[0], 2);
      expect(updatedHandlePoint[1]).toBeCloseTo(expectedHandle[1], 2);
      expect(updatedHandlePoint[2]).toBeCloseTo(expectedHandle[2], 2);
    });

    test('dragging the line body translates both handles by the same world delta', async () => {
      const ctx = await setupTools({
        tools: [LengthTool],
        activeTool: LengthTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { viewport, element } = ctx;

      const p1World: Types.Point3 = [10, 40, 0];
      const p2World: Types.Point3 = [30, 40, 0]; // 20mm, horizontal
      const p1Canvas = round2(viewport.worldToCanvas(p1World));
      const p2Canvas = round2(viewport.worldToCanvas(p2World));

      let rendered = waitForAnnotationRendered(element);
      mouseDrag(element, p1Canvas, p2Canvas);
      await rendered;

      const annotations = annotation.state.getAnnotations(
        LengthTool.toolName,
        element
      );
      expect(annotations.length).toBe(1);
      const lengthAnnotation = annotations[0];

      const originalHandles = lengthAnnotation.data.handles.points.map(
        (point: Types.Point3) => [...point] as Types.Point3
      );
      const originalLength = worldDistance(originalHandles[0], originalHandles[1]);

      // Midpoint of the line, far from both handles' hit-test proximity, so
      // this hits the tool body (toolSelectedCallback -> handleIndex
      // undefined in _dragCallback -> whole-annotation translate), not a
      // handle. Interaction sequence learned from
      // packages/tools/test/LengthTool_test.js
      // "Should successfully create a length tool and select AND move it".
      const midCanvas: [number, number] = [
        (p1Canvas[0] + p2Canvas[0]) / 2,
        (p1Canvas[1] + p2Canvas[1]) / 2,
      ];
      const toCanvas: [number, number] = [midCanvas[0] + 40, midCanvas[1] - 25];

      const fromWorld = viewport.canvasToWorld(round2(midCanvas));
      const toWorld = viewport.canvasToWorld(round2(toCanvas));
      const expectedDelta: Types.Point3 = [
        toWorld[0] - fromWorld[0],
        toWorld[1] - fromWorld[1],
        toWorld[2] - fromWorld[2],
      ];

      rendered = waitForAnnotationRendered(element);
      mouseDrag(element, midCanvas, toCanvas);
      await rendered;

      const updatedHandles = lengthAnnotation.data.handles.points;
      for (let i = 0; i < originalHandles.length; i++) {
        expect(updatedHandles[i][0]).toBeCloseTo(
          originalHandles[i][0] + expectedDelta[0],
          2
        );
        expect(updatedHandles[i][1]).toBeCloseTo(
          originalHandles[i][1] + expectedDelta[1],
          2
        );
        expect(updatedHandles[i][2]).toBeCloseTo(
          originalHandles[i][2] + expectedDelta[2],
          2
        );
      }

      const updatedLength = worldDistance(updatedHandles[0], updatedHandles[1]);
      expect(updatedLength).toBeCloseTo(originalLength, 3);
    });
  });
});
