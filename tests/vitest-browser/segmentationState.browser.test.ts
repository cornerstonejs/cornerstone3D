// State-based tests for the labelmap segmentation lifecycle on a
// GenericViewport stack (voxel values, segment indices, active-segmentation
// bookkeeping, visibility, events, statistics). No pixels are asserted
// anywhere in this file.
//
// Setup recipe (mirrors tests/genericViewport/genericStackLabelmapSegmentation.spec.ts
// and packages/tools/examples/genericStackLabelmapSegmentation/index.ts, using
// only public @cornerstonejs/core and @cornerstonejs/tools exports):
//   1. tools harness viewport: setupTools({ tools: [BrushTool], viewport: {...} })
//      (vtkImage render mode, 5-slice default synthetic stack -- 64x64, 1mm
//      spacing, background value 10 + sliceIndex, vertical bar value 255 at
//      world x in [20, 25), see harness/fakeImageStack.ts).
//   2. imageLoader.createAndCacheDerivedLabelmapImages(ctx.imageIds) -- one
//      derived Uint8Array labelmap image per stack imageId, index-aligned
//      with ctx.imageIds (slice k's labelmap is labelmapImageIds[k]). This is
//      a synchronous public core API (no promise despite the example
//      `await`-ing it).
//   3. segmentation.addSegmentations([{ segmentationId, representation: {
//        type: Enums.SegmentationRepresentations.Labelmap,
//        data: { imageIds: labelmapImageIds } } }])
//   4. await segmentation.addSegmentationRepresentations(viewportId, [{
//        segmentationId, type: Enums.SegmentationRepresentations.Labelmap,
//      }]) -- synchronous in the current implementation, `await` is a no-op.
//   5. toolGroup.addToolInstance('CircularBrush', BrushTool.toolName, {
//        activeStrategy: 'FILL_INSIDE_CIRCLE', preview: { enabled: false },
//      }) (+ a 'CircularEraser' instance with 'ERASE_INSIDE_CIRCLE'), then
//      toolGroup.setToolActive(instanceName, { bindings: [{ mouseButton:
//      MouseBindings.Primary }] }). setBrushSizeForToolGroup(toolGroupId,
//      radiusMm) pins the brush radius (world mm, verified against
//      packages/tools/src/tools/segmentation/strategies/compositions/circularCursor.ts).
//
// Engine-source findings that shaped this file (see final report for the
// full writeup):
//   - All segmentation events (Events.ts CORNERSTONE_TOOLS_SEGMENTATION_*)
//     are triggered on the @cornerstonejs/core `eventTarget` singleton, never
//     on the viewport element -- confirmed by reading every
//     stateManagement/segmentation/events/trigger*.ts source file.
//   - Events.SEGMENTATION_REPRESENTATION_ADDED is declared in the Events enum
//     and listened for internally (packages/tools/src/init.ts), but no
//     production code path ever triggers it -- addSegmentationRepresentations
//     only triggers SEGMENTATION_REPRESENTATION_MODIFIED and
//     SEGMENTATION_MODIFIED. Documented as a dedicated test.fails below.
//   - A synthetic mousedown+mouseup at the same point (mouseClick) is held by
//     mouseDownListener.ts's double-click disambiguation timer for up to 400ms
//     (real setTimeout, real wall-clock time in this real-browser test) before
//     MOUSE_CLICK actually dispatches. Every wait in this file uses a timeout
//     comfortably above that.
//   - getUniqueSegmentIndices reads the segmentation's `segments` bookkeeping
//     map (populated by setActiveSegmentIndex), not a live voxel scan -- an
//     index shows up the moment it becomes active, whether or not any voxel
//     has been painted with it yet.
//   - The first SEGMENTATION_RENDERED after adding a representation is
//     RAF-gated (SegmentationRenderingEngine schedules it via
//     window.requestAnimationFrame) and its latency is highly variable in
//     this environment -- headless Chromium under vitest browser mode logs
//     frequent "WebGL context lost" warnings as each test's RenderingEngine
//     is created and destroyed in quick succession, and GPU/rAF scheduling
//     visibly slows down under that context churn. Observed wait times for
//     the same code path ranged from under 100ms to several seconds across
//     runs. waitForFirstSegmentationRender below uses a generous timeout and,
//     if it elapses, falls back to an explicit viewport.render() retry
//     (observed to unstick it) before giving up for real.
import { afterEach, describe, expect, test } from 'vitest';
import { cache, eventTarget, imageLoader, Enums as CoreEnums } from '@cornerstonejs/core';
import type { Types as CoreTypes } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import {
  mouseClick,
  setupTools,
  waitForToolsEvent,
  type ToolsContext,
} from './harness';

// @cornerstonejs/core does not re-export IImage from its top-level entry
// point (only via the Types namespace), unlike most other core types used
// across this suite.
type IImage = CoreTypes.IImage;

const { BrushTool, segmentation } = cornerstoneTools;
const { Events: ToolsEvents, MouseBindings } = cornerstoneTools.Enums;
const { Labelmap: LABELMAP } = cornerstoneTools.Enums.SegmentationRepresentations;
const segmentationUtils = cornerstoneTools.utilities.segmentation;

const BRUSH_INSTANCE = 'VitestCircularBrush';
const ERASER_INSTANCE = 'VitestCircularEraser';

// Canvas point mandated by the plan for the primary paint stroke.
const PRIMARY_PAINT_CANVAS: [number, number] = [200, 200];
const PRIMARY_PAINT_RADIUS_MM = 5;

let active: ToolsContext | null = null;

afterEach(() => {
  if (!active) {
    return;
  }

  const ctx = active;
  active = null;
  ctx.cleanup();
});

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

async function setupSegmentationHarness(): Promise<ToolsContext> {
  const ctx = await setupTools({
    tools: [BrushTool],
    viewport: { width: 400, height: 400 },
  });

  const toolGroup = ctx.toolGroup as ToolsTypes.IToolGroup;

  toolGroup.addToolInstance(BRUSH_INSTANCE, BrushTool.toolName, {
    activeStrategy: 'FILL_INSIDE_CIRCLE',
    preview: { enabled: false },
  });
  toolGroup.addToolInstance(ERASER_INSTANCE, BrushTool.toolName, {
    activeStrategy: 'ERASE_INSIDE_CIRCLE',
    preview: { enabled: false },
  });

  return ctx;
}

/**
 * Activates exactly one of the brush/eraser instances on the Primary mouse
 * binding. setToolActive does NOT automatically deactivate a previously
 * active tool sharing the same binding (verified by reading ToolGroup.ts --
 * the example app's toolbar handler explicitly calls setToolDisabled on the
 * previously active tool before activating a new one), so the previous
 * instance is disabled first to avoid both instances responding to the same
 * click.
 */
function activateBrushInstance(
  ctx: ToolsContext,
  instanceName: typeof BRUSH_INSTANCE | typeof ERASER_INSTANCE
): void {
  const toolGroup = ctx.toolGroup as ToolsTypes.IToolGroup;
  const other = instanceName === BRUSH_INSTANCE ? ERASER_INSTANCE : BRUSH_INSTANCE;

  toolGroup.setToolDisabled(other);
  toolGroup.setToolActive(instanceName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
}

function setBrushRadius(ctx: ToolsContext, radiusMm: number): void {
  segmentationUtils.setBrushSizeForToolGroup(ctx.toolGroupId, radiusMm);
}

interface SegmentationSetup {
  segmentationId: string;
  labelmapImageIds: string[];
}

/**
 * Waits for the first post-add SEGMENTATION_RENDERED for `segmentationId`,
 * tolerating this environment's highly variable RAF-scheduling latency (see
 * file header). If the primary wait elapses, falls back to an explicit
 * `viewport.render()` + IMAGE_RENDERED wait, which was observed to reliably
 * unstick a delayed render pass without depending on
 * SegmentationRenderingEngine's internal RAF queue at all.
 */
async function waitForFirstSegmentationRender(
  ctx: ToolsContext,
  segmentationId: string
): Promise<void> {
  const primaryWait = waitForToolsEvent(
    eventTarget,
    ToolsEvents.SEGMENTATION_RENDERED,
    { timeoutMs: 8000 }
  );

  try {
    await primaryWait;
    return;
  } catch {
    // Fall through to the manual-render fallback below.
  }

  const fallbackWait = waitForToolsEvent(
    ctx.element,
    CoreEnums.Events.IMAGE_RENDERED,
    { timeoutMs: 5000 }
  );
  ctx.viewport.render();

  try {
    await fallbackWait;
  } catch (fallbackError) {
    throw new Error(
      `SEGMENTATION_RENDERED never fired for ${segmentationId} within 8000ms, ` +
        `and the viewport.render() fallback also did not fire IMAGE_RENDERED ` +
        `within 5000ms: ${(fallbackError as Error).message}`
    );
  }
}

/**
 * Creates one derived-labelmap segmentation (one labelmap image per stack
 * imageId, index-aligned with ctx.imageIds) and adds a Labelmap
 * representation of it to the harness viewport.
 */
async function createLabelmapSegmentation(
  ctx: ToolsContext,
  segmentationId: string
): Promise<SegmentationSetup> {
  const derivedImages = imageLoader.createAndCacheDerivedLabelmapImages(
    ctx.imageIds
  );
  const labelmapImageIds = derivedImages.map((image) => image.imageId);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: LABELMAP,
        data: { imageIds: labelmapImageIds },
      },
    },
  ]);

  const renderedWait = waitForFirstSegmentationRender(ctx, segmentationId);

  await segmentation.addSegmentationRepresentations(ctx.viewportId, [
    { segmentationId, type: LABELMAP },
  ]);

  // Wait for the first labelmap render pass to complete before returning.
  // internalAddSegmentationRepresentation only schedules a render (via
  // triggerSegmentationModified -> SegmentationRenderingEngine's RAF-based
  // queue); painting before that first render pass runs leaves the
  // labelmap-to-viewport viewability bookkeeping
  // (LabelmapImageReferenceResolver) unresolved, and the brush strategy
  // silently no-ops.
  await renderedWait;

  return { segmentationId, labelmapImageIds };
}

// ---------------------------------------------------------------------------
// Voxel-reading helpers (public: cache.getImage + IImage.voxelManager.getAtIJK)
// ---------------------------------------------------------------------------

function getLabelmapImage(imageId: string): IImage {
  const image = cache.getImage(imageId);

  if (!image) {
    throw new Error(`Labelmap image not found in cache: ${imageId}`);
  }

  return image;
}

function countVoxelsMatching(
  image: IImage,
  predicate: (value: number) => boolean
): number {
  const { rows, columns, voxelManager } = image;
  let count = 0;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      if (predicate(voxelManager.getAtIJK(i, j, 0) as number)) {
        count++;
      }
    }
  }

  return count;
}

interface CentroidResult {
  count: number;
  /** [I, J] centroid in voxel-index space; null when count === 0. */
  centroidIJ: [number, number] | null;
}

function centroidOfVoxelsMatching(
  image: IImage,
  predicate: (value: number) => boolean
): CentroidResult {
  const { rows, columns, voxelManager } = image;
  let count = 0;
  let sumI = 0;
  let sumJ = 0;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      if (predicate(voxelManager.getAtIJK(i, j, 0) as number)) {
        count++;
        sumI += i;
        sumJ += j;
      }
    }
  }

  return {
    count,
    centroidIJ: count > 0 ? [sumI / count, sumJ / count] : null,
  };
}

// The synthetic stack's imagePlaneModule (identity orientation, 1mm spacing,
// imagePositionPatient = [0, 0, sliceIndex]) is copied verbatim onto every
// derived labelmap image by core's createAndCacheDerivedImage, so voxel
// (column I, row J) on slice k sits at world [I, J, k] -- the same closed-form
// relationship already relied on by toolMeasurements.browser.test.ts for the
// same harness stack.
function voxelIJToWorld(i: number, j: number, sliceIndex: number): CoreTypes.Point3 {
  return [i, j, sliceIndex];
}

// ---------------------------------------------------------------------------
// Event waiting (local, not the shared recordEvents harness helper: that
// helper only retains a fixed allowlist of detail keys for memory safety,
// which does not include `segmentationId` -- see harness/recordEvents.ts
// INTERESTING_DETAIL_KEYS. The events-contract test needs the full detail, so
// it listens directly on eventTarget here instead.)
// ---------------------------------------------------------------------------

function waitForSegmentationDataModified(
  segmentationId: string,
  timeoutMs = 5000
): Promise<CustomEvent> {
  return new Promise<CustomEvent>((resolve, reject) => {
    const onEvent = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as
        | { segmentationId?: string }
        | undefined;

      if (detail?.segmentationId === segmentationId) {
        clearTimeout(timer);
        eventTarget.removeEventListener(
          ToolsEvents.SEGMENTATION_DATA_MODIFIED,
          onEvent
        );
        resolve(evt as CustomEvent);
      }
    };

    const timer = setTimeout(() => {
      eventTarget.removeEventListener(
        ToolsEvents.SEGMENTATION_DATA_MODIFIED,
        onEvent
      );
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for SEGMENTATION_DATA_MODIFIED (segmentationId=${segmentationId})`
        )
      );
    }, timeoutMs);

    eventTarget.addEventListener(ToolsEvents.SEGMENTATION_DATA_MODIFIED, onEvent);
  });
}

/**
 * Clicks at `canvasPoint` and waits for the SEGMENTATION_DATA_MODIFIED event
 * carrying `segmentationId`. The click itself may sit behind mouseDownListener's
 * up-to-400ms double-click disambiguation timer (real wall-clock time in this
 * real-browser test) before the underlying MOUSE_CLICK (and therefore the
 * brush fill) actually fires -- waitForSegmentationDataModified's default
 * 5000ms timeout comfortably covers that.
 */
async function paintAndWaitForDataModified(
  ctx: ToolsContext,
  canvasPoint: [number, number],
  segmentationId: string
): Promise<CustomEvent> {
  const dataModified = waitForSegmentationDataModified(segmentationId);
  mouseClick(ctx.element, canvasPoint);
  return dataModified;
}

describe('segmentationState', () => {
  test('paint produces exactly-typed voxels at the right place', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const { segmentationId, labelmapImageIds } = await createLabelmapSegmentation(
      ctx,
      'vitest-seg-paint'
    );

    activateBrushInstance(ctx, BRUSH_INSTANCE);
    setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

    await paintAndWaitForDataModified(ctx, PRIMARY_PAINT_CANVAS, segmentationId);

    const activeSegmentIndex = segmentation.segmentIndex.getActiveSegmentIndex(
      segmentationId
    );
    expect(activeSegmentIndex).toBe(1);

    const slice0Image = getLabelmapImage(labelmapImageIds[0]);
    const nonZero = centroidOfVoxelsMatching(slice0Image, (v) => v !== 0);

    expect(nonZero.count).toBeGreaterThan(0);

    // Every nonzero voxel must carry the default active segment index (1).
    const nonDefaultValue = countVoxelsMatching(
      slice0Image,
      (v) => v !== 0 && v !== activeSegmentIndex
    );
    expect(nonDefaultValue).toBe(0);

    // Centroid of the painted voxels must equal canvasToWorld(the click
    // point) within one voxel spacing (1mm).
    const expectedWorld = ctx.viewport.canvasToWorld(PRIMARY_PAINT_CANVAS);
    const [centroidI, centroidJ] = nonZero.centroidIJ as [number, number];
    const centroidWorld = voxelIJToWorld(centroidI, centroidJ, 0);

    expect(centroidWorld[0]).toBeCloseTo(expectedWorld[0], 0);
    expect(centroidWorld[1]).toBeCloseTo(expectedWorld[1], 0);

    // Loose disc-area sanity bound: [0.6, 1.4] x (pi * r^2) for the
    // configured brush radius (1mm voxel spacing => 1 voxel per mm^2).
    const expectedArea = Math.PI * PRIMARY_PAINT_RADIUS_MM * PRIMARY_PAINT_RADIUS_MM;
    expect(nonZero.count).toBeGreaterThanOrEqual(expectedArea * 0.6);
    expect(nonZero.count).toBeLessThanOrEqual(expectedArea * 1.4);

    // Regression sentinel: exact observed voxel count for a 5mm-radius
    // circular fill centered at canvasToWorld([200, 200]) on the harness's
    // default 64x64/1mm synthetic stack, pinned from repeated actual runs
    // (consistently 80, not recomputed from the area formula -- pi*5^2 is
    // ~78.5, and rasterization is not obliged to match that exactly). If
    // this changes, the fill rasterization algorithm changed -- update the
    // pin after confirming the new count is still within the loose bound
    // above.
    expect(nonZero.count).toBe(80);
  });

  test('slice isolation: a circular brush on a stack only affects the current slice', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const { segmentationId, labelmapImageIds } = await createLabelmapSegmentation(
      ctx,
      'vitest-seg-slice-isolation'
    );

    activateBrushInstance(ctx, BRUSH_INSTANCE);
    setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

    expect(ctx.viewport.getCurrentImageIdIndex()).toBe(0);

    await paintAndWaitForDataModified(ctx, PRIMARY_PAINT_CANVAS, segmentationId);

    const slice0Image = getLabelmapImage(labelmapImageIds[0]);
    const slice0NonZero = countVoxelsMatching(slice0Image, (v) => v !== 0);
    expect(slice0NonZero).toBeGreaterThan(0);

    const slice1Image = getLabelmapImage(labelmapImageIds[1]);
    const slice1NonZero = countVoxelsMatching(slice1Image, (v) => v !== 0);
    expect(slice1NonZero).toBe(0);
  });

  test('segment index switching: new voxels take the new index, old voxels keep theirs', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const { segmentationId, labelmapImageIds } = await createLabelmapSegmentation(
      ctx,
      'vitest-seg-index-switch'
    );

    activateBrushInstance(ctx, BRUSH_INSTANCE);
    setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

    await paintAndWaitForDataModified(ctx, PRIMARY_PAINT_CANVAS, segmentationId);

    const slice0Image = getLabelmapImage(labelmapImageIds[0]);
    const segment1CountBefore = countVoxelsMatching(slice0Image, (v) => v === 1);
    expect(segment1CountBefore).toBeGreaterThan(0);

    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 2);
    expect(
      segmentation.segmentIndex.getActiveSegmentIndex(segmentationId)
    ).toBe(2);

    // A different location, well separated from the first paint (world [50,
    // 15, 0] vs. the first paint's ~world [32, 32, 0]) so the two discs
    // (radius 5mm each) cannot overlap.
    const secondWorldTarget: CoreTypes.Point3 = [50, 15, 0];
    const secondCanvasPoint = ctx.viewport.worldToCanvas(secondWorldTarget);

    await paintAndWaitForDataModified(
      ctx,
      [Math.round(secondCanvasPoint[0]), Math.round(secondCanvasPoint[1])],
      segmentationId
    );

    const segment1CountAfter = countVoxelsMatching(slice0Image, (v) => v === 1);
    const segment2Count = countVoxelsMatching(slice0Image, (v) => v === 2);

    expect(segment1CountAfter).toBe(segment1CountBefore);
    expect(segment2Count).toBeGreaterThan(0);

    const uniqueIndices = segmentationUtils.getUniqueSegmentIndices(
      segmentationId
    );
    expect(uniqueIndices).toEqual([1, 2]);
  });

  test('eraser clears only the erased region, leaving other segments untouched', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const { segmentationId, labelmapImageIds } = await createLabelmapSegmentation(
      ctx,
      'vitest-seg-eraser'
    );

    activateBrushInstance(ctx, BRUSH_INSTANCE);
    setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

    // Segment 1 at the primary paint point.
    await paintAndWaitForDataModified(ctx, PRIMARY_PAINT_CANVAS, segmentationId);

    segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 2);

    const segment2WorldTarget: CoreTypes.Point3 = [50, 15, 0];
    const segment2Canvas = ctx.viewport.worldToCanvas(segment2WorldTarget);
    const segment2CanvasPoint: [number, number] = [
      Math.round(segment2Canvas[0]),
      Math.round(segment2Canvas[1]),
    ];

    await paintAndWaitForDataModified(ctx, segment2CanvasPoint, segmentationId);

    const slice0Image = getLabelmapImage(labelmapImageIds[0]);
    const segment1CountBeforeErase = countVoxelsMatching(
      slice0Image,
      (v) => v === 1
    );
    const segment2CountBeforeErase = countVoxelsMatching(
      slice0Image,
      (v) => v === 2
    );
    expect(segment1CountBeforeErase).toBeGreaterThan(0);
    expect(segment2CountBeforeErase).toBeGreaterThan(0);

    // Erase exactly where segment 1 was painted, with a radius >= the paint
    // radius (equal, via the same setBrushSizeForToolGroup call, which sets
    // every brush-based instance in the tool group uniformly).
    activateBrushInstance(ctx, ERASER_INSTANCE);
    setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

    await paintAndWaitForDataModified(ctx, PRIMARY_PAINT_CANVAS, segmentationId);

    const segment1CountAfterErase = countVoxelsMatching(
      slice0Image,
      (v) => v === 1
    );
    const segment2CountAfterErase = countVoxelsMatching(
      slice0Image,
      (v) => v === 2
    );

    expect(segment1CountAfterErase).toBe(0);
    expect(segment2CountAfterErase).toBe(segment2CountBeforeErase);
  });

  test('active segmentation bookkeeping: getActiveSegmentation/setActiveSegmentation route paints', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const seg1 = await createLabelmapSegmentation(ctx, 'vitest-seg-active-1');
    const seg2 = await createLabelmapSegmentation(ctx, 'vitest-seg-active-2');

    // Finding: adding a second segmentation representation to a viewport
    // makes IT the active one -- SegmentationStateManager.addDefaultSegmentationRepresentation
    // pushes { active: true } and then calls _setActiveSegmentation for the
    // newly added segmentation unconditionally, with no code path that
    // demotes a previously active representation before that push. Pinning
    // the observed behavior here since the plan only asks to "pin which is
    // active after adding two".
    const activeAfterAdd = segmentation.activeSegmentation.getActiveSegmentation(
      ctx.viewportId
    );
    expect(activeAfterAdd?.segmentationId).toBe(seg2.segmentationId);

    activateBrushInstance(ctx, BRUSH_INSTANCE);
    setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

    // Flip active to segmentation 1 and paint: must land in seg1's labelmap.
    segmentation.activeSegmentation.setActiveSegmentation(
      ctx.viewportId,
      seg1.segmentationId
    );
    expect(
      segmentation.activeSegmentation.getActiveSegmentation(ctx.viewportId)
        ?.segmentationId
    ).toBe(seg1.segmentationId);

    await paintAndWaitForDataModified(
      ctx,
      PRIMARY_PAINT_CANVAS,
      seg1.segmentationId
    );

    const seg1Slice0 = getLabelmapImage(seg1.labelmapImageIds[0]);
    const seg2Slice0 = getLabelmapImage(seg2.labelmapImageIds[0]);

    expect(countVoxelsMatching(seg1Slice0, (v) => v !== 0)).toBeGreaterThan(0);
    expect(countVoxelsMatching(seg2Slice0, (v) => v !== 0)).toBe(0);

    // Flip active back to segmentation 2 and paint elsewhere: must land in
    // seg2's labelmap, leaving seg1 untouched.
    segmentation.activeSegmentation.setActiveSegmentation(
      ctx.viewportId,
      seg2.segmentationId
    );
    expect(
      segmentation.activeSegmentation.getActiveSegmentation(ctx.viewportId)
        ?.segmentationId
    ).toBe(seg2.segmentationId);

    const seg2WorldTarget: CoreTypes.Point3 = [50, 15, 0];
    const seg2Canvas = ctx.viewport.worldToCanvas(seg2WorldTarget);
    const seg2CanvasPoint: [number, number] = [
      Math.round(seg2Canvas[0]),
      Math.round(seg2Canvas[1]),
    ];

    const seg1CountBeforeSecondPaint = countVoxelsMatching(
      seg1Slice0,
      (v) => v !== 0
    );

    await paintAndWaitForDataModified(
      ctx,
      seg2CanvasPoint,
      seg2.segmentationId
    );

    expect(countVoxelsMatching(seg2Slice0, (v) => v !== 0)).toBeGreaterThan(0);
    expect(countVoxelsMatching(seg1Slice0, (v) => v !== 0)).toBe(
      seg1CountBeforeSecondPaint
    );
  });

  test('visibility round trip: setSegmentationRepresentationVisibility / getSegmentationRepresentationVisibility', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const { segmentationId } = await createLabelmapSegmentation(
      ctx,
      'vitest-seg-visibility'
    );

    const specifier = { segmentationId, type: LABELMAP };

    // Default visibility must be true (a freshly added representation is
    // visible by default -- see SegmentationStateManager.addDefaultSegmentationRepresentation).
    expect(
      segmentation.config.visibility.getSegmentationRepresentationVisibility(
        ctx.viewportId,
        specifier
      )
    ).toBe(true);

    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      ctx.viewportId,
      specifier,
      false
    );
    expect(
      segmentation.config.visibility.getSegmentationRepresentationVisibility(
        ctx.viewportId,
        specifier
      )
    ).toBe(false);

    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      ctx.viewportId,
      specifier,
      true
    );
    expect(
      segmentation.config.visibility.getSegmentationRepresentationVisibility(
        ctx.viewportId,
        specifier
      )
    ).toBe(true);
  });

  test('events contract: ADDED/MODIFIED ordering, DATA_MODIFIED detail, REMOVED isolation', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const seg1Id = 'vitest-seg-events-1';
    const seg2Id = 'vitest-seg-events-2';

    // Local ordering recorder: records event TYPES only (order is all that
    // matters here), attached directly to eventTarget -- the confirmed
    // dispatch target for every segmentation event (see file header and
    // stateManagement/segmentation/events/trigger*.ts).
    const order: string[] = [];
    const trackedTypes = [
      ToolsEvents.SEGMENTATION_ADDED,
      ToolsEvents.SEGMENTATION_MODIFIED,
      ToolsEvents.SEGMENTATION_REMOVED,
    ];
    const onTracked = (evt: Event) => order.push(evt.type);
    trackedTypes.forEach((type) => eventTarget.addEventListener(type, onTracked));

    try {
      const seg1 = await createLabelmapSegmentation(ctx, seg1Id);
      const seg2 = await createLabelmapSegmentation(ctx, seg2Id);

      // addSegmentations triggers SEGMENTATION_ADDED (from
      // SegmentationStateManager.addSegmentation) followed synchronously by
      // SEGMENTATION_MODIFIED (from addSegmentations.ts itself) for each
      // segmentation -- assert ADDED precedes MODIFIED for segmentation 1.
      const addedIndex = order.indexOf(ToolsEvents.SEGMENTATION_ADDED);
      const modifiedIndex = order.indexOf(ToolsEvents.SEGMENTATION_MODIFIED);
      expect(addedIndex).toBeGreaterThanOrEqual(0);
      expect(modifiedIndex).toBeGreaterThan(addedIndex);

      expect(order.filter((t) => t === ToolsEvents.SEGMENTATION_ADDED).length).toBe(
        2
      );

      // One paint stroke fires at least one DATA_MODIFIED whose detail
      // carries the segmentationId. Adding segmentation 2 after segmentation
      // 1 made segmentation 2 the active one (see the active-segmentation
      // bookkeeping test's finding), so segmentation 1 is explicitly
      // reactivated here -- otherwise the brush would paint into
      // segmentation 2 and this wait would time out.
      segmentation.activeSegmentation.setActiveSegmentation(
        ctx.viewportId,
        seg1.segmentationId
      );
      activateBrushInstance(ctx, BRUSH_INSTANCE);
      setBrushRadius(ctx, PRIMARY_PAINT_RADIUS_MM);

      const dataModifiedEvent = await paintAndWaitForDataModified(
        ctx,
        PRIMARY_PAINT_CANVAS,
        seg1.segmentationId
      );
      expect(dataModifiedEvent.detail.segmentationId).toBe(seg1.segmentationId);

      // removeSegmentation fires REMOVED and getSegmentation returns
      // undefined afterwards; segmentation 2 and its representation survive.
      const removed = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_REMOVED
      );
      segmentation.removeSegmentation(seg1.segmentationId);
      await removed;

      expect(order).toContain(ToolsEvents.SEGMENTATION_REMOVED);
      expect(segmentation.state.getSegmentation(seg1.segmentationId)).toBeUndefined();
      expect(segmentation.state.getSegmentation(seg2.segmentationId)).toBeDefined();
      expect(
        segmentation.state.getSegmentationRepresentations(ctx.viewportId, {
          segmentationId: seg2.segmentationId,
        }).length
      ).toBe(1);
    } finally {
      trackedTypes.forEach((type) =>
        eventTarget.removeEventListener(type, onTracked)
      );
    }
  });

  // Genuine engine finding, not a test mistake: Events.SEGMENTATION_REPRESENTATION_ADDED
  // is declared in packages/tools/src/enums/Events.ts and is subscribed to
  // internally in packages/tools/src/init.ts (lines ~168, ~230), but no
  // production code path anywhere in packages/tools/src ever triggers it --
  // there is no `triggerEvent(..., Events.SEGMENTATION_REPRESENTATION_ADDED,
  // ...)` call in the entire source tree. Adding a segmentation representation
  // to a viewport instead triggers SEGMENTATION_REPRESENTATION_MODIFIED (from
  // SegmentationStateManager.addSegmentationRepresentation) and
  // SEGMENTATION_MODIFIED (from internalAddSegmentationRepresentation).
  // Observed: REPRESENTATION_ADDED never recorded. Expected (per the plan and
  // the enum's own name): it should fire once when a representation is first
  // added to a viewport.
  test.fails(
    'events contract: SEGMENTATION_REPRESENTATION_ADDED never fires (engine bug)',
    async () => {
      const ctx = await setupSegmentationHarness();
      active = ctx;

      // Settle immediately (via .then's two handlers, attached in the same
      // microtask the promise is created in) rather than awaiting the raw
      // promise directly. createLabelmapSegmentation's own render wait can
      // take several seconds in this environment (see file header), which is
      // longer than this wait's 2000ms timeout -- if the timeout's rejection
      // fires while control is still inside that other await, Vitest's
      // browser runtime flags it as an unhandled rejection (a real error,
      // separate from -- and reported even though -- this test's expected
      // failure) before this function ever reaches a bare `await
      // representationAdded`. Attaching both handlers up front avoids that.
      const representationAddedSettled: Promise<Error | undefined> =
        waitForToolsEvent(
          eventTarget,
          ToolsEvents.SEGMENTATION_REPRESENTATION_ADDED,
          { timeoutMs: 2000 }
        ).then(
          () => undefined,
          (err: Error) => err
        );

      await createLabelmapSegmentation(ctx, 'vitest-seg-representation-added');

      const settledError = await representationAddedSettled;
      if (settledError) {
        throw settledError;
      }
    }
  );

  test('exact statistics on synthetic data: mean/min/max/voxelCount inside the bar', async () => {
    const ctx = await setupSegmentationHarness();
    active = ctx;

    const { segmentationId, labelmapImageIds } = await createLabelmapSegmentation(
      ctx,
      'vitest-seg-statistics'
    );

    activateBrushInstance(ctx, BRUSH_INSTANCE);
    // Small brush, fully inside the bar (world x in [20, 25); center 22.5,
    // radius 1.5 => x in [21, 24], matching the interior already proven safe
    // by toolMeasurements.browser.test.ts's RectangleROI statistics test).
    const STATS_RADIUS_MM = 1.5;
    setBrushRadius(ctx, STATS_RADIUS_MM);

    const statsWorldTarget: CoreTypes.Point3 = [22.5, 30, 0];
    const statsCanvas = ctx.viewport.worldToCanvas(statsWorldTarget);
    const statsCanvasPoint: [number, number] = [
      Math.round(statsCanvas[0]),
      Math.round(statsCanvas[1]),
    ];

    await paintAndWaitForDataModified(ctx, statsCanvasPoint, segmentationId);

    const slice0Image = getLabelmapImage(labelmapImageIds[0]);
    const activeSegmentIndex = segmentation.segmentIndex.getActiveSegmentIndex(
      segmentationId
    );
    const expectedVoxelCount = countVoxelsMatching(
      slice0Image,
      (v) => v === activeSegmentIndex
    );
    expect(expectedVoxelCount).toBeGreaterThan(0);

    const TIMEOUT_MS = 8000;
    // getStatistics's return type is a union with the per-segment-index-keyed
    // shape (only possible when `segmentIndices` is an array in 'individual'
    // mode); passing a single number with the default 'collective' mode
    // always yields the flat NamedStatistics branch actually asserted below.
    let stats: ToolsTypes.NamedStatistics;

    try {
      stats = (await Promise.race([
        segmentationUtils.getStatistics({
          segmentationId,
          segmentIndices: activeSegmentIndex,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('getStatistics timed out (worker did not resolve)')),
            TIMEOUT_MS
          )
        ),
      ])) as ToolsTypes.NamedStatistics;
    } catch (error) {
      // Per the plan: if the worker-based statistics path cannot resolve
      // under vitest browser mode, this single test is timeboxed and its
      // failure mode is documented here rather than hanging the suite. See
      // the final report for whether this branch was actually taken.
      throw new Error(
        `utilities.segmentation.getStatistics did not resolve within ${TIMEOUT_MS}ms: ${
          (error as Error).message
        }`
      );
    }

    expect(stats.mean.value).toBe(255);
    expect(stats.min.value).toBe(255);
    expect(stats.max.value).toBe(255);
    expect(stats.count.value).toBe(expectedVoxelCount);
  });
});
