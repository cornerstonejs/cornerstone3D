// State-based tests pinning the undo/redo history contract exposed through
// `@cornerstonejs/core`'s `utilities.HistoryMemo.DefaultHistoryMemo` singleton
// and the `HISTORY_UNDO`/`HISTORY_REDO` events `@cornerstonejs/tools` fires
// around it. No pixels: every assertion reads labelmap scalar data (a public
// core `IImage`'s `voxelManager.getScalarData()`), annotation state, or event
// detail.
//
// Discovered facts (from packages/core/src/utilities/historyMemo/index.ts and
// packages/tools/src/tools/{base,segmentation}/*.ts -- read, not modified):
//
// - `DefaultHistoryMemo` is a ring buffer (`HistoryMemo`, default size 50)
//   holding `Memo` items, each with an optional `id`/`operationType`. `push()`
//   always clears the redo side (`redoAvailable = 0`) before writing, i.e.
//   pushing a new item after an undo permanently truncates the redo branch --
//   there is no "redo re-applies stale item on top" bug, by construction.
// - `undo()`/`redo()` are fully SYNCHRONOUS: they run every affected memo's
//   `restoreMemo()` (which itself synchronously calls
//   `triggerSegmentationDataModified`/annotation state mutators) and then, if
//   the memo has a truthy `id`, synchronously dispatch `HISTORY_UNDO`/
//   `HISTORY_REDO` on `eventTarget` -- the CORE `eventTarget` singleton, not
//   the viewport element (see historyMemo/index.ts `dispatchHistoryEvent`).
// - `DefaultHistoryMemo` is a core-level singleton: `cornerstoneTools.destroy()`
//   (packages/tools/src/init.ts) resets tool/annotation/segmentation state but
//   never touches it. Tests below reset it explicitly via the `size` setter
//   (the only public API that clears the ring) before/after every test to
//   avoid cross-test leakage within this file.
// - Labelmap brush strokes ARE memo-integrated by default: `BrushTool`'s
//   default `preview.enabled` is `false`, so each stroke commits synchronously
//   on mouse-up (`doneEditMemo` -> `LabelmapMemo.commitMemo` -> push), with
//   `operationType: 'labelmap'` and a uuid `id`.
// - Annotation creation-via-drag is ALSO memo-integrated by default: every
//   annotation tool's `_dragCallback` calls `this.createMemo(element,
//   annotation, { newAnnotation: true })` on the first drag step (see e.g.
//   LengthTool.ts), which pushes an `operationType: 'annotation'` memo
//   immediately (not deferred to mouse-up). That memo's `restoreMemo` is a
//   pure toggle around a captured `deleting` flag: since it was pushed with
//   `deleting: false`, the FIRST `undo()` call removes the just-drawn
//   annotation entirely (not a partial rollback to a half-drawn state), and
//   the following `redo()` re-adds it with the exact original `data` (a
//   `safeStructuredClone`, so redo is byte-exact). This is pinned as test 8
//   below.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  cache,
  eventTarget,
  imageLoader,
  utilities,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  mouseClick,
  mouseDrag,
  mouseDragPath,
  renderAndWait,
  setupTools,
  waitForAnnotationRendered,
  waitForToolsEvent,
  type ToolsContext,
} from './harness';

const {
  BrushTool,
  LengthTool,
  PlanarFreehandContourSegmentationTool,
  annotation,
  segmentation,
} = cornerstoneTools;
const { Events: ToolsEvents, SegmentationRepresentations } =
  cornerstoneTools.Enums;
const { DefaultHistoryMemo } = utilities.HistoryMemo;

// Captured once at module load so the reset below never hard-codes the
// library's current default ring size.
const DEFAULT_HISTORY_SIZE = DefaultHistoryMemo.size;

/**
 * The `size` setter is the only public API that clears `DefaultHistoryMemo`'s
 * ring (see historyMemo/index.ts): re-assigning it re-initializes
 * `position`/`redoAvailable`/`undoAvailable` unconditionally, even to the
 * same value. Needed because this singleton outlives any one test/tool-group
 * and `cornerstoneTools.destroy()` never touches it.
 */
function resetHistory(): void {
  DefaultHistoryMemo.size = DEFAULT_HISTORY_SIZE;
}

interface LabelmapHistoryContext extends ToolsContext {
  segmentationId: string;
  labelmapImageIds: string[];
}

interface ContourHistoryContext extends ToolsContext {
  segmentationId: string;
}

/**
 * Local labelmap-on-generic-stack setup helper, derived from the public
 * incantation in packages/tools/examples/genericStackLabelmapSegmentation
 * (and mirrored by the Playwright spec
 * tests/genericViewport/genericStackLabelmapSegmentation.spec.ts): a stack
 * PLANAR_NEXT viewport, one derived Uint8Array labelmap image per stack
 * imageId, a single Labelmap segmentation registered and attached to the
 * viewport, and BrushTool active with a small (world-mm) radius so several
 * disjoint strokes fit inside the 64x64mm synthetic slice without
 * overlapping. Kept local to this file (not imported from a sibling spec) per
 * the plan's isolation requirement.
 */
async function setupLabelmapHistoryTest(): Promise<LabelmapHistoryContext> {
  resetHistory();

  const ctx = await setupTools({
    tools: [BrushTool],
    activeTool: BrushTool.toolName,
    viewport: { width: 400, height: 400 },
  });

  const labelmapImages = await imageLoader.createAndCacheDerivedLabelmapImages(
    ctx.imageIds
  );
  const labelmapImageIds = labelmapImages.map((image) => image.imageId);
  const segmentationId = `vitest-history-seg-${utilities.uuidv4()}`;

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: { imageIds: labelmapImageIds },
      },
    },
  ]);

  await segmentation.addSegmentationRepresentations(ctx.viewportId, [
    { segmentationId, type: SegmentationRepresentations.Labelmap },
  ]);

  // Default BrushTool brushSize is a 25mm WORLD-space radius (see
  // circularCursor.ts composition) -- far too large for the 64x64mm
  // synthetic slice to fit multiple disjoint strokes, so shrink it.
  cornerstoneTools.utilities.segmentation.setBrushSizeForToolGroup(
    ctx.toolGroupId,
    3
  );

  await renderAndWait(ctx.element, ctx.viewport);

  return { ...ctx, segmentationId, labelmapImageIds };
}

async function setupContourHistoryTest(): Promise<ContourHistoryContext> {
  resetHistory();

  const ctx = await setupTools({
    tools: [PlanarFreehandContourSegmentationTool],
    activeTool: PlanarFreehandContourSegmentationTool.toolName,
    viewport: { width: 400, height: 400 },
  });
  const segmentationId = `vitest-history-contour-${utilities.uuidv4()}`;

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Contour,
      },
    },
  ]);

  await segmentation.addSegmentationRepresentations(ctx.viewportId, [
    {
      segmentationId,
      type: SegmentationRepresentations.Contour,
    },
  ]);
  segmentation.activeSegmentation.setActiveSegmentation(
    ctx.viewportId,
    segmentationId
  );
  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);

  await renderAndWait(ctx.element, ctx.viewport);

  return { ...ctx, segmentationId };
}

async function drawContour(
  ctx: ContourHistoryContext,
  points: [number, number][]
): Promise<void> {
  const completed = waitForToolsEvent(
    eventTarget,
    ToolsEvents.ANNOTATION_CUT_MERGE_PROCESS_COMPLETED
  );
  mouseDragPath(ctx.element, points);
  await completed;
}

function readSliceScalarData(imageId: string): Uint8Array {
  const image = cache.getImage(imageId);
  return image.voxelManager.getScalarData() as Uint8Array;
}

/** index -> segment value, for byte-exact before/after comparisons. */
function nonZeroMap(scalarData: Uint8Array): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] !== 0) {
      map.set(i, scalarData[i]);
    }
  }
  return map;
}

function mapsEqual(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function canvasPointForWorld(
  viewport: LabelmapHistoryContext['viewport'],
  worldXY: [number, number]
): [number, number] {
  const canvas = viewport.worldToCanvas([worldXY[0], worldXY[1], 0]);
  return [canvas[0], canvas[1]];
}

/**
 * Paints one brush stroke (a single click -- BrushTool's default
 * `preview.enabled: false` config applies the fill synchronously on
 * mouse-up, see BrushTool.ts `_endCallback`) at the given WORLD xy on slice
 * 0, waiting for the SEGMENTATION_DATA_MODIFIED it triggers.
 */
async function paintAt(
  ctx: LabelmapHistoryContext,
  worldXY: [number, number]
): Promise<void> {
  const canvasPoint = canvasPointForWorld(ctx.viewport, worldXY);
  const modified = waitForToolsEvent(
    eventTarget,
    ToolsEvents.SEGMENTATION_DATA_MODIFIED
  );
  mouseClick(ctx.element, canvasPoint);
  await modified;
}

interface FullRecordedEvent {
  type: string;
  detail: unknown;
}

/**
 * Full-fidelity event recorder (unlike harness/recordEvents.ts, which only
 * retains a fixed allowlist of shallow detail keys that does not include
 * HISTORY_UNDO/REDO's `id`/`operationType`/`isUndo` or
 * SEGMENTATION_DATA_MODIFIED's `segmentationId`). Local to this file.
 */
function recordFullEvents(target: EventTarget, types: string[]) {
  const events: FullRecordedEvent[] = [];
  const listener = (evt: Event) => {
    events.push({ type: evt.type, detail: (evt as CustomEvent).detail });
  };
  types.forEach((type) => target.addEventListener(type, listener));

  return {
    events,
    clear(): void {
      events.length = 0;
    },
    stop(): void {
      types.forEach((type) => target.removeEventListener(type, listener));
    },
  };
}

let active: { cleanup(): void } | null = null;

beforeEach(() => {
  resetHistory();
});

afterEach(() => {
  resetHistory();

  try {
    segmentation.removeAllSegmentations();
  } catch {
    // Nothing to remove -- not an error.
  }

  if (active) {
    const ctx = active;
    active = null;
    ctx.cleanup();
  }
});

describe('undoRedoHistory', () => {
  describe('labelmap brush strokes', () => {
    test('brush stroke undo restores exact voxel state', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;
      const sliceImageId = ctx.labelmapImageIds[0];

      await paintAt(ctx, [10, 10]);

      const afterPaint = nonZeroMap(readSliceScalarData(sliceImageId));
      const countAfterPaint = afterPaint.size;
      expect(countAfterPaint).toBeGreaterThan(0);
      expect(DefaultHistoryMemo.canUndo).toBe(true);

      const undone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await undone;

      const afterUndo = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(afterUndo.size).toBe(0);
    });

    test('redo restores the exact stroke (byte-exact)', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;
      const sliceImageId = ctx.labelmapImageIds[0];

      await paintAt(ctx, [10, 10]);
      const afterPaint = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(afterPaint.size).toBeGreaterThan(0);

      const undone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await undone;
      expect(nonZeroMap(readSliceScalarData(sliceImageId)).size).toBe(0);

      const redone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.redo();
      await redone;

      const afterRedo = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(afterRedo.size).toBe(afterPaint.size);
      expect(mapsEqual(afterRedo, afterPaint)).toBe(true);
    });

    test('multi-step undo/redo follows strict LIFO ordering, region-wise', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;
      const sliceImageId = ctx.labelmapImageIds[0];

      // Three strokes 40mm apart (radius 3mm, see setupLabelmapHistoryTest)
      // so their painted discs cannot overlap.
      await paintAt(ctx, [10, 10]);
      const map1 = nonZeroMap(readSliceScalarData(sliceImageId));

      await paintAt(ctx, [50, 10]);
      const map12 = nonZeroMap(readSliceScalarData(sliceImageId));

      await paintAt(ctx, [10, 50]);
      const map123 = nonZeroMap(readSliceScalarData(sliceImageId));

      expect(map1.size).toBeGreaterThan(0);
      expect(map12.size).toBeGreaterThan(map1.size);
      expect(map123.size).toBeGreaterThan(map12.size);

      // Undo once -> back to exactly the post-stroke-2 state: stroke 3's
      // region is empty, strokes 1-2 are untouched (byte-exact map equality,
      // not just a total-count check).
      let pending = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await pending;
      expect(
        mapsEqual(nonZeroMap(readSliceScalarData(sliceImageId)), map12)
      ).toBe(true);

      // Undo twice more -> stroke 1 only, then empty.
      pending = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await pending;
      expect(
        mapsEqual(nonZeroMap(readSliceScalarData(sliceImageId)), map1)
      ).toBe(true);

      pending = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await pending;
      expect(nonZeroMap(readSliceScalarData(sliceImageId)).size).toBe(0);
      expect(DefaultHistoryMemo.canUndo).toBe(false);

      // Redo three times -> exact byte-for-byte replay of each recorded
      // state, all three regions intact.
      for (const expectedMap of [map1, map12, map123]) {
        pending = waitForToolsEvent(
          eventTarget,
          ToolsEvents.SEGMENTATION_DATA_MODIFIED
        );
        DefaultHistoryMemo.redo();
        await pending;
        expect(
          mapsEqual(nonZeroMap(readSliceScalarData(sliceImageId)), expectedMap)
        ).toBe(true);
      }
      expect(DefaultHistoryMemo.canRedo).toBe(false);
    });

    test('undo across segment-index switches restores segment-scoped voxel state', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;
      const sliceImageId = ctx.labelmapImageIds[0];
      const { segmentationId } = ctx;

      await paintAt(ctx, [10, 10]); // default active segment index: 1
      const mapSeg1 = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapSeg1.size).toBeGreaterThan(0);
      for (const value of mapSeg1.values()) {
        expect(value).toBe(1);
      }

      segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 2);
      await paintAt(ctx, [50, 50]); // disjoint location, segment 2

      const mapBoth = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapBoth.size).toBeGreaterThan(mapSeg1.size);
      for (const [index, value] of mapBoth) {
        if (mapSeg1.has(index)) {
          expect(value).toBe(1);
        } else {
          expect(value).toBe(2);
        }
      }

      const undone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await undone;

      const afterUndo = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapsEqual(afterUndo, mapSeg1)).toBe(true);
      for (const value of afterUndo.values()) {
        expect(value).toBe(1);
      }

      const redone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.redo();
      await redone;

      const afterRedo = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapsEqual(afterRedo, mapBoth)).toBe(true);
    });

    // `getUniqueSegmentIndices` (packages/tools/src/utilities/segmentation/
    // getUniqueSegmentIndices.ts, exposed publicly as
    // `cornerstoneTools.utilities.segmentation.getUniqueSegmentIndices`) is
    // METADATA-driven for Labelmap segmentations: it returns
    // `Object.keys(segmentation.segments)`, a dict of segment entries created
    // by `setActiveSegmentIndex` (see stateManagement/segmentation/
    // segmentIndex.ts), never by an actual voxel scan and never pruned by
    // undo. This is a divergence from the plan's expectation ("[1] after
    // undo, [1,2] after redo") -- undoing away segment 2's only voxels does
    // NOT remove 2 from this list, because nothing deletes the
    // `segments[2]` metadata entry the earlier `setActiveSegmentIndex(id, 2)`
    // call created. Kept as its own `test.fails` (not folded into the
    // byte-exact voxel test above, which passes cleanly) so the genuine
    // engine behavior is documented without weakening either assertion.
    test.fails(
      'getUniqueSegmentIndices reflects actual voxel presence after undo (observed: does not)',
      async () => {
        const ctx = await setupLabelmapHistoryTest();
        active = ctx;
        const { segmentationId } = ctx;

        await paintAt(ctx, [10, 10]);
        segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 2);
        await paintAt(ctx, [50, 50]);

        const indicesAfterPaint =
          cornerstoneTools.utilities.segmentation.getUniqueSegmentIndices(
            segmentationId
          );
        expect(indicesAfterPaint).toEqual([1, 2]);

        const undone = waitForToolsEvent(
          eventTarget,
          ToolsEvents.SEGMENTATION_DATA_MODIFIED
        );
        DefaultHistoryMemo.undo();
        await undone;

        // Expected (per plan 11): segment 2's voxels are gone, so the unique
        // segment list should shrink back to [1]. Observed: it stays [1, 2]
        // because getUniqueSegmentIndices never scans voxel data -- see
        // comment above.
        const indicesAfterUndo =
          cornerstoneTools.utilities.segmentation.getUniqueSegmentIndices(
            segmentationId
          );
        expect(indicesAfterUndo).toEqual([1]);
      }
    );

    test('HISTORY_UNDO/HISTORY_REDO fire on the core eventTarget with the expected payload', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;

      await paintAt(ctx, [30, 30]);

      const recorder = recordFullEvents(eventTarget, [
        ToolsEvents.HISTORY_UNDO,
        ToolsEvents.HISTORY_REDO,
      ]);

      const modifiedByUndo = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await modifiedByUndo;

      const undoEvents = recorder.events.filter(
        (e) => e.type === ToolsEvents.HISTORY_UNDO
      );
      expect(undoEvents.length).toBe(1);
      expect(
        recorder.events.filter((e) => e.type === ToolsEvents.HISTORY_REDO)
          .length
      ).toBe(0);

      const undoDetail = undoEvents[0].detail as {
        isUndo: boolean;
        id: string;
        operationType: string;
      };
      expect(undoDetail.isUndo).toBe(true);
      expect(typeof undoDetail.id).toBe('string');
      expect(undoDetail.id.length).toBeGreaterThan(0);
      expect(undoDetail.operationType).toBe('labelmap');

      recorder.clear();

      const modifiedByRedo = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.redo();
      await modifiedByRedo;

      const redoEvents = recorder.events.filter(
        (e) => e.type === ToolsEvents.HISTORY_REDO
      );
      expect(redoEvents.length).toBe(1);
      expect(
        recorder.events.filter((e) => e.type === ToolsEvents.HISTORY_UNDO)
          .length
      ).toBe(0);

      const redoDetail = redoEvents[0].detail as {
        isUndo: boolean;
        id: string;
        operationType: string;
      };
      expect(redoDetail.isUndo).toBe(false);
      expect(redoDetail.id).toBe(undoDetail.id);
      expect(redoDetail.operationType).toBe('labelmap');

      recorder.stop();
    });

    test('undo/redo are safe no-ops on an empty history stack', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;
      const sliceImageId = ctx.labelmapImageIds[0];

      expect(DefaultHistoryMemo.canUndo).toBe(false);
      expect(DefaultHistoryMemo.canRedo).toBe(false);

      const recorder = recordFullEvents(eventTarget, [
        ToolsEvents.HISTORY_UNDO,
        ToolsEvents.HISTORY_REDO,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED,
      ]);

      // undo()/redo() are fully synchronous (see file header): if nothing
      // fires, it has already not-fired by the time the call returns, so no
      // event-driven wait is needed to assert absence.
      expect(() => DefaultHistoryMemo.undo()).not.toThrow();
      expect(() => DefaultHistoryMemo.redo()).not.toThrow();

      expect(recorder.events.length).toBe(0);
      expect(nonZeroMap(readSliceScalarData(sliceImageId)).size).toBe(0);

      // Now: paint, undo (consumes the only entry), undo again past the
      // beginning -> second undo must also be a safe no-op.
      await paintAt(ctx, [10, 10]);
      expect(
        nonZeroMap(readSliceScalarData(sliceImageId)).size
      ).toBeGreaterThan(0);

      const undone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await undone;
      expect(nonZeroMap(readSliceScalarData(sliceImageId)).size).toBe(0);
      expect(DefaultHistoryMemo.canUndo).toBe(false);

      recorder.clear();
      expect(() => DefaultHistoryMemo.undo()).not.toThrow();
      expect(recorder.events.length).toBe(0);
      expect(nonZeroMap(readSliceScalarData(sliceImageId)).size).toBe(0);

      recorder.stop();
    });

    test('a new stroke after undo truncates the redo branch', async () => {
      const ctx = await setupLabelmapHistoryTest();
      active = ctx;
      const sliceImageId = ctx.labelmapImageIds[0];

      await paintAt(ctx, [10, 10]); // stroke A
      const mapA = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapA.size).toBeGreaterThan(0);

      const undone = waitForToolsEvent(
        eventTarget,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED
      );
      DefaultHistoryMemo.undo();
      await undone;
      expect(nonZeroMap(readSliceScalarData(sliceImageId)).size).toBe(0);
      expect(DefaultHistoryMemo.canRedo).toBe(true);

      await paintAt(ctx, [50, 50]); // stroke B, disjoint location
      const mapB = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapB.size).toBeGreaterThan(0);

      // Pushing B must have cleared the redo side (HistoryMemo.push always
      // zeroes redoAvailable before writing -- see file header).
      expect(DefaultHistoryMemo.canRedo).toBe(false);

      const recorder = recordFullEvents(eventTarget, [
        ToolsEvents.HISTORY_REDO,
        ToolsEvents.SEGMENTATION_DATA_MODIFIED,
      ]);
      DefaultHistoryMemo.redo();
      expect(recorder.events.length).toBe(0);
      recorder.stop();

      // Voxel state must be untouched: exactly stroke B, nothing from A
      // reappeared on top of it.
      const afterRedoAttempt = nonZeroMap(readSliceScalarData(sliceImageId));
      expect(mapsEqual(afterRedoAttempt, mapB)).toBe(true);
      for (const index of mapA.keys()) {
        expect(afterRedoAttempt.has(index)).toBe(false);
      }
    });
  });

  describe('annotation undo/redo', () => {
    test('annotation creation via drag participates in the memo system: undo removes it, redo restores exact handle positions', async () => {
      const ctx = await setupTools({
        tools: [LengthTool],
        activeTool: LengthTool.toolName,
        viewport: { width: 400, height: 400 },
      });
      active = ctx;
      const { element } = ctx;

      const p1: [number, number] = [100, 200];
      const p2: [number, number] = [200, 200];

      const rendered = waitForAnnotationRendered(element);
      mouseDrag(element, p1, p2);
      await rendered;

      const drawnAnnotations = annotation.state.getAnnotations(
        LengthTool.toolName,
        element
      );
      expect(drawnAnnotations.length).toBe(1);

      const annotationUID = drawnAnnotations[0].annotationUID;
      const originalHandlePoints = drawnAnnotations[0].data.handles.points.map(
        (point: Types.Point3) => [...point]
      );

      // Pinned finding (see file header): the drag's first move already
      // pushed a memo for this annotation's creation.
      expect(DefaultHistoryMemo.canUndo).toBe(true);

      DefaultHistoryMemo.undo();

      const afterUndo =
        annotation.state.getAnnotations(LengthTool.toolName, element) ?? [];
      expect(afterUndo.length).toBe(0);

      DefaultHistoryMemo.redo();

      const afterRedo =
        annotation.state.getAnnotations(LengthTool.toolName, element) ?? [];
      expect(afterRedo.length).toBe(1);
      expect(afterRedo[0].annotationUID).toBe(annotationUID);

      const restoredHandlePoints = afterRedo[0].data.handles.points.map(
        (point: Types.Point3) => [...point]
      );
      expect(restoredHandlePoints).toEqual(originalHandlePoints);
    });

    test('contour merge undo restores the previous contour and redo restores the merged result', async () => {
      const ctx = await setupContourHistoryTest();
      active = ctx;
      const { element } = ctx;
      const toolName = PlanarFreehandContourSegmentationTool.toolName;

      await drawContour(ctx, [
        [100, 100],
        [240, 100],
        [240, 240],
        [100, 240],
        [100, 100],
      ]);

      const firstAnnotations =
        annotation.state.getAnnotations(toolName, element) ?? [];
      expect(firstAnnotations.length).toBe(1);
      const firstAnnotationUID = firstAnnotations[0].annotationUID;

      await drawContour(ctx, [
        [180, 160],
        [300, 160],
        [300, 280],
        [180, 280],
        [180, 160],
      ]);

      const mergedAnnotations =
        annotation.state.getAnnotations(toolName, element) ?? [];
      expect(mergedAnnotations.length).toBe(1);
      const mergedAnnotationUID = mergedAnnotations[0].annotationUID;
      expect(mergedAnnotationUID).not.toBe(firstAnnotationUID);

      DefaultHistoryMemo.undo();

      const afterUndo =
        annotation.state.getAnnotations(toolName, element) ?? [];
      expect(afterUndo.length).toBe(1);
      expect(afterUndo[0].annotationUID).toBe(firstAnnotationUID);

      DefaultHistoryMemo.redo();

      const afterRedo =
        annotation.state.getAnnotations(toolName, element) ?? [];
      expect(afterRedo.length).toBe(1);
      expect(afterRedo[0].annotationUID).toBe(mergedAnnotationUID);
    });
  });
});
