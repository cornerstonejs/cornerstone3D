// State-based tests pinning the contracts of the `cornerstoneTools.annotation`
// namespace (state, selection, locking, visibility) plus the annotation event
// surface and JSON persistence, driven against a GenericViewport (PLANAR_NEXT)
// harness viewport. Black box: every assertion goes through the public
// `@cornerstonejs/tools` / `@cornerstonejs/core` exports, DOM state, and
// events -- never through packages/tools/src/** deep imports.
//
// Annotations are created realistically (mouse-drawn LengthTool annotations
// via the harness's mouseDrag) except in the test that explicitly exercises
// the programmatic `addAnnotation` round trip.
//
// Event target facts verified against packages/tools/src/stateManagement/annotation/**
// (do not re-derive, see plans/vitest-browser-state-tests/09-annotation-state-management.md):
//   - ANNOTATION_ADDED, ANNOTATION_MODIFIED, ANNOTATION_COMPLETED,
//     ANNOTATION_REMOVED, ANNOTATION_SELECTION_CHANGE, ANNOTATION_LOCK_CHANGE,
//     ANNOTATION_VISIBILITY_CHANGE all dispatch on the core `eventTarget`
//     singleton (every trigger* helper in stateManagement/annotation/helpers/
//     state.ts, annotationSelection.ts, annotationLocking.ts and
//     annotationVisibility.ts calls `triggerEvent(eventTarget, ...)`
//     directly -- never on an element).
//   - ANNOTATION_RENDERED is the one exception: AnnotationRenderingEngine
//     dispatches it on the viewport `element` (see
//     stateManagement/annotation/AnnotationRenderingEngine.ts).
//
// Two non-obvious, verified-empirically behaviors that shape several tests
// below (see the final report for the full writeup):
//   - Drawing a NEW annotation auto-selects it: mouseDownActivate.ts calls
//     `setAnnotationSelected(annotation.annotationUID)` (preserveSelected
//     defaults to false) right after `activeTool.addNewAnnotation(...)`
//     returns, so the most-recently-drawn annotation is always the sole
//     selected one, and any handle-drag manipulation re-fires the same
//     select (see mouseDown.ts `toggleAnnotationSelection`).
//   - `addAnnotation`'s target manager has a permanently-installed
//     preprocessing hook (packages/tools/src/stateManagement/annotation/
//     resetAnnotationManager.ts, wired at module load via
//     `defaultManager.setPreprocessingFn`) that ACTIVELY OVERWRITES a
//     just-added annotation's `isLocked`/`isVisible` flags from the current
//     `locking`/`visibility` UID stores, regardless of what value the
//     incoming object already carried. `isSelected` has no equivalent hook,
//     so it is left exactly as the incoming object had it. This asymmetry
//     is pinned in test 7.
//
// `cornerstoneTools.annotation` public surface (verified from
// packages/tools/src/stateManagement/annotation/index.ts): `state` (spread of
// annotationState.ts + helpers/state.ts + resetAnnotationManager),
// `selection` (annotationSelection.ts), `locking` (annotationLocking.ts),
// `visibility` (annotationVisibility.ts), `config` (style/font helpers, not
// exercised here). Exact function names used below were read directly off
// those modules' `export {}` blocks, not guessed.
import { afterEach, describe, expect, test } from 'vitest';
import type { Types } from '@cornerstonejs/core';
import { eventTarget } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  setupTools,
  mouseDrag,
  waitForAnnotationRendered,
  waitForToolsEvent,
  type ToolsContext,
} from './harness';

const { LengthTool, annotation } = cornerstoneTools;
const { Events: ToolsEvents } = cornerstoneTools.Enums;
const { filterAnnotationsForDisplay } = cornerstoneTools.utilities.planar;

type CanvasPoint = [number, number];

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function expectPointCloseTo(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  precision = 3
): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(round6(actual[i])).toBeCloseTo(round6(expected[i]), precision);
  }
}

let active: ToolsContext | null = null;

afterEach(() => {
  active?.cleanup();
  active = null;

  // Selection/locking/visibility are UID-keyed module-level Sets, entirely
  // separate from the annotation manager that `cleanup()` above resets via
  // `removeAllAnnotations()` -- they are NOT reset by
  // `cornerstoneTools.destroy()`/`init()` either. Reset them defensively so
  // no test's selection/lock/visibility state can leak into the next one
  // (shared-context hard constraint 8: every test independent).
  //
  // Each call is independently try/caught: `annotationVisibility.ts`'s
  // internal `show()`/`hide()` helpers (unlike `lock()`/`unlock()` in
  // annotationLocking.ts and `clearSelectionSet()` in
  // annotationSelection.ts, which all guard with `if (annotation) {...}`)
  // unconditionally dereference `getAnnotation(annotationUID)` and throw
  // `TypeError: Cannot set properties of undefined (setting 'isVisible')`
  // if that UID's annotation was removed (e.g. by test 8, which hides then
  // removes the same annotation) -- a real, narrow defensive-coding
  // inconsistency in the source, verified empirically here, not a mistake
  // in this cleanup. Guarding keeps this afterEach robust regardless.
  try {
    annotation.selection.deselectAnnotation();
  } catch {
    // See comment above: tolerate a stale/removed UID.
  }
  try {
    annotation.locking.unlockAllAnnotations();
  } catch {
    // See comment above: tolerate a stale/removed UID.
  }
  try {
    annotation.visibility.showAllAnnotations();
  } catch {
    // See comment above: tolerate a stale/removed UID (the actual trigger
    // for this guard, per annotationVisibility.ts's missing null check).
  }
});

async function setup(): Promise<ToolsContext> {
  const ctx = await setupTools({
    tools: [LengthTool],
    activeTool: LengthTool.toolName,
  });
  active = ctx;
  return ctx;
}

/**
 * Draws a Length annotation via a single mouseDrag from p1 to p2 (canvas
 * points, integer-rounded by the harness) and waits for ANNOTATION_RENDERED
 * -- the event that reliably gates populated cachedStats (see
 * harness/tools.ts `waitForAnnotationRendered`). Returns the created
 * annotation, which is a live reference into the annotation manager's
 * internal array (new annotations are always appended, see
 * FrameOfReferenceSpecificAnnotationManager.addAnnotation), not a copy.
 */
async function drawLength(
  ctx: ToolsContext,
  p1: CanvasPoint,
  p2: CanvasPoint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { element } = ctx;
  const rendered = waitForAnnotationRendered(element);
  mouseDrag(element, p1, p2);
  await rendered;

  const anns = annotation.state.getAnnotations(LengthTool.toolName, element);
  return anns[anns.length - 1];
}

/** Current canvas position of a handle, for driving a follow-up mouseDrag. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canvasPointOfHandle(
  ctx: ToolsContext,
  ann: any,
  index: number
): CanvasPoint {
  const world = ann.data.handles.points[index];
  const canvas = ctx.viewport.worldToCanvas(world);
  return [canvas[0], canvas[1]];
}

/** Collapses consecutive duplicate entries, per the stabilization rule used
 * by the core event-contracts golden-sequence test
 * (tests/vitest-browser/eventContracts.browser.test.ts). */
function collapseConsecutive(sequence: string[]): string[] {
  return sequence.filter((type, i) => i === 0 || sequence[i - 1] !== type);
}

/** Asserts `golden` appears, in order, as a (non-contiguous) subsequence of
 * `observed`. Mirrors the ordered-subsequence stabilization rule from
 * eventContracts.browser.test.ts's "golden event sequence" test. */
function expectOrderedSubsequence(observed: string[], golden: string[]): void {
  let cursor = 0;
  for (const expectedType of golden) {
    const foundIndex = observed.indexOf(expectedType, cursor);
    expect(
      foundIndex,
      `expected "${expectedType}" at-or-after position ${cursor} in observed sequence ${JSON.stringify(
        observed
      )}`
    ).toBeGreaterThanOrEqual(0);
    cursor = foundIndex + 1;
  }
}

describe('annotationStateManagement', () => {
  // ==========================================================================
  // 1. State CRUD
  // ==========================================================================
  test('state CRUD: getAnnotations, getAnnotation, removeAnnotation, removeAllAnnotations', async () => {
    const ctx = await setup();
    const { element } = ctx;

    const a = await drawLength(ctx, [60, 60], [160, 60]);
    const b = await drawLength(ctx, [60, 240], [160, 240]);

    const all = annotation.state.getAnnotations(LengthTool.toolName, element);
    expect(all.length).toBe(2);

    const uids = all.map((x: { annotationUID: string }) => x.annotationUID);
    expect(new Set(uids).size).toBe(2);
    expect([...uids].sort()).toEqual(
      [a.annotationUID, b.annotationUID].sort()
    );

    // getAnnotation returns the SAME object reference, not a copy.
    expect(annotation.state.getAnnotation(a.annotationUID)).toBe(a);
    expect(annotation.state.getAnnotation(b.annotationUID)).toBe(b);

    const removedPromise = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_REMOVED
    );
    annotation.state.removeAnnotation(a.annotationUID);
    const removedEvent = await removedPromise;
    expect(removedEvent.detail.annotation.annotationUID).toBe(a.annotationUID);

    const afterRemove = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(afterRemove.length).toBe(1);
    expect(afterRemove[0].annotationUID).toBe(b.annotationUID);

    annotation.state.removeAllAnnotations();
    expect(
      annotation.state.getAnnotations(LengthTool.toolName, element).length
    ).toBe(0);
  });

  // ==========================================================================
  // 2. Programmatic addAnnotation round trip
  // ==========================================================================
  test('programmatic addAnnotation restores a structured-cloned mouse-drawn annotation', async () => {
    const ctx = await setup();
    const { viewport, element } = ctx;

    const drawn = await drawLength(ctx, [70, 90], [210, 90]);
    const uid = drawn.annotationUID;
    const originalPoints = drawn.data.handles.points.map(
      (p: Types.Point3) => [...p]
    );

    const clone = structuredClone(drawn);

    annotation.state.removeAllAnnotations();
    expect(
      annotation.state.getAnnotations(LengthTool.toolName, element).length
    ).toBe(0);

    const returnedUid = annotation.state.addAnnotation(clone, element);
    expect(returnedUid).toBe(uid);

    const restoredList = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(restoredList.length).toBe(1);

    const restored = restoredList[0];
    expect(restored.annotationUID).toBe(uid);
    restored.data.handles.points.forEach((p: Types.Point3, i: number) =>
      expectPointCloseTo(p, originalPoints[i], 6)
    );

    // Filterable for display on the slice it was drawn on -- this is the
    // persistence primitive: a restored annotation behaves identically to a
    // freshly drawn one.
    const filtered = filterAnnotationsForDisplay(viewport, restoredList);
    expect(filtered.map((a: { annotationUID: string }) => a.annotationUID)).toEqual([
      uid,
    ]);
  });

  // ==========================================================================
  // 3. Selection contract
  // ==========================================================================
  test('selection: preserve-flag semantics and ANNOTATION_SELECTION_CHANGE detail', async () => {
    const ctx = await setup();
    const { element } = ctx;

    const a = await drawLength(ctx, [60, 60], [140, 60]);
    const b = await drawLength(ctx, [60, 220], [140, 220]);
    const uid1 = a.annotationUID;
    const uid2 = b.annotationUID;

    // Compatibility finding (see file header): drawing a NEW annotation
    // auto-selects it and replaces any prior selection, so after these two
    // draws only the LAST one (b/uid2) is selected -- not neither, not both.
    expect(annotation.selection.getAnnotationsSelected()).toEqual([uid2]);

    // Reset to a known empty baseline before exercising the selection
    // contract itself, so the assertions below are unambiguous.
    annotation.selection.deselectAnnotation();
    expect(annotation.selection.getAnnotationsSelected()).toEqual([]);

    // Select uid1.
    let changed = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_SELECTION_CHANGE
    );
    annotation.selection.setAnnotationSelected(uid1, true);
    let evt = await changed;
    expect(annotation.selection.isAnnotationSelected(uid1)).toBe(true);
    expect(annotation.selection.getAnnotationsSelected()).toEqual([uid1]);
    expect(evt.detail.added).toEqual([uid1]);
    expect(evt.detail.removed).toEqual([]);

    // Select uid2 WITHOUT preserve (default false): replaces the selection.
    changed = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_SELECTION_CHANGE
    );
    annotation.selection.setAnnotationSelected(uid2, true);
    evt = await changed;
    expect(annotation.selection.isAnnotationSelected(uid1)).toBe(false);
    expect(annotation.selection.isAnnotationSelected(uid2)).toBe(true);
    expect(evt.detail.added).toEqual([uid2]);
    expect(evt.detail.removed).toEqual([uid1]);

    // Select uid1 WITH preserveSelected=true: both selected.
    changed = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_SELECTION_CHANGE
    );
    annotation.selection.setAnnotationSelected(uid1, true, true);
    evt = await changed;
    expect(annotation.selection.isAnnotationSelected(uid1)).toBe(true);
    expect(annotation.selection.isAnnotationSelected(uid2)).toBe(true);
    expect(new Set(annotation.selection.getAnnotationsSelected())).toEqual(
      new Set([uid1, uid2])
    );
    expect(evt.detail.added).toEqual([uid1]);
    expect(evt.detail.removed).toEqual([]);

    // Deselect all via the public API (deselectAnnotation with no uid).
    changed = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_SELECTION_CHANGE
    );
    annotation.selection.deselectAnnotation();
    evt = await changed;
    expect(annotation.selection.getAnnotationsSelected()).toEqual([]);
    expect(annotation.selection.isAnnotationSelected(uid1)).toBe(false);
    expect(annotation.selection.isAnnotationSelected(uid2)).toBe(false);
    expect([...evt.detail.removed].sort()).toEqual([uid1, uid2].sort());
  });

  // ==========================================================================
  // 4. Locking contract
  // ==========================================================================
  test('locking: setAnnotationLocked blocks handle manipulation until unlocked', async () => {
    const ctx = await setup();
    const { viewport, element } = ctx;

    const ann = await drawLength(ctx, [80, 80], [180, 80]);
    const uid = ann.annotationUID;

    const lockChanged = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_LOCK_CHANGE
    );
    annotation.locking.setAnnotationLocked(uid, true);
    const lockEvent = await lockChanged;
    expect(annotation.locking.isAnnotationLocked(uid)).toBe(true);
    expect(lockEvent.detail.added).toEqual([uid]);

    const preDragPoints = ann.data.handles.points.map((p: Types.Point3) => [
      ...p,
    ]);
    const handleCanvas = canvasPointOfHandle(ctx, ann, 0);
    const elsewhereCanvas: CanvasPoint = [
      handleCanvas[0] + 40,
      handleCanvas[1] + 40,
    ];

    const rendered1 = waitForAnnotationRendered(element);
    mouseDrag(element, handleCanvas, elsewhereCanvas);
    await rendered1;

    // Behavioral consequence of locking, verified against
    // packages/tools/src/store/filterToolsWithMoveableHandles.ts and
    // filterMoveableAnnotationTools.ts: both skip `annotation.isLocked`
    // annotations during mousedown hit-testing, so a drag starting exactly
    // at the locked annotation's handle is NOT recognized as a manipulation
    // of that annotation at all. With LengthTool still the active/Primary
    // tool, mousedown instead falls through to mouseDownActivate and draws a
    // BRAND NEW Length annotation from the same two points -- a genuine
    // compatibility finding, not a test bug (see final report). Verify the
    // ORIGINAL annotation's points are untouched, then remove the stray one
    // before continuing so the unlock step below is unambiguous.
    const afterLockedDrag = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(afterLockedDrag.length).toBe(2);

    const stillOriginal = annotation.state.getAnnotation(uid);
    expectPointCloseTo(
      stillOriginal.data.handles.points[0],
      preDragPoints[0],
      6
    );
    expectPointCloseTo(
      stillOriginal.data.handles.points[1],
      preDragPoints[1],
      6
    );

    const stray = afterLockedDrag.find(
      (candidate: { annotationUID: string }) =>
        candidate.annotationUID !== uid
    );
    annotation.state.removeAnnotation(stray.annotationUID);
    expect(
      annotation.state.getAnnotations(LengthTool.toolName, element).length
    ).toBe(1);

    const unlockChanged = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_LOCK_CHANGE
    );
    annotation.locking.setAnnotationLocked(uid, false);
    const unlockEvent = await unlockChanged;
    expect(annotation.locking.isAnnotationLocked(uid)).toBe(false);
    expect(unlockEvent.detail.removed).toEqual([uid]);

    // The SAME drag now moves the handle: unlocked annotations are found by
    // filterToolsWithMoveableHandles, so mousedown is consumed by
    // handleSelectedCallback instead of falling through.
    const rendered2 = waitForAnnotationRendered(element);
    mouseDrag(element, handleCanvas, elsewhereCanvas);
    await rendered2;

    const expectedWorld = viewport.canvasToWorld(elsewhereCanvas);
    const afterUnlockDrag = annotation.state.getAnnotation(uid);
    expectPointCloseTo(
      afterUnlockDrag.data.handles.points[0],
      expectedWorld,
      2
    );
  });

  // ==========================================================================
  // 5. Visibility contract
  // ==========================================================================
  test('visibility: setAnnotationVisibility toggles both the store and annotation.isVisible', async () => {
    const ctx = await setup();
    const ann = await drawLength(ctx, [80, 80], [180, 80]);
    const uid = ann.annotationUID;

    expect(annotation.visibility.isAnnotationVisible(uid)).toBe(true);
    expect(ann.isVisible).not.toBe(false);

    let changed = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_VISIBILITY_CHANGE
    );
    annotation.visibility.setAnnotationVisibility(uid, false);
    let evt = await changed;
    expect(annotation.visibility.isAnnotationVisible(uid)).toBe(false);
    // Pinned: visibility is BOTH a UID-keyed store (globalHiddenAnnotationUIDsSet
    // in annotationVisibility.ts) AND mirrored directly onto the annotation
    // object's `isVisible` flag by the same call -- unlike selection/locking,
    // which (per test 7) do NOT get repopulated on a naive restore.
    expect(ann.isVisible).toBe(false);
    expect(evt.detail.lastHidden).toEqual([uid]);
    expect(evt.detail.hidden).toEqual([uid]);

    changed = waitForToolsEvent(
      eventTarget,
      ToolsEvents.ANNOTATION_VISIBILITY_CHANGE
    );
    annotation.visibility.setAnnotationVisibility(uid, true);
    evt = await changed;
    expect(annotation.visibility.isAnnotationVisible(uid)).toBe(true);
    expect(ann.isVisible).toBe(true);
    expect(evt.detail.lastVisible).toEqual([uid]);
    expect(evt.detail.hidden).toEqual([]);
  });

  // ==========================================================================
  // 6. Slice binding and display filtering
  // ==========================================================================
  test('annotations are slice-bound and filterAnnotationsForDisplay reflects the current slice', async () => {
    const ctx = await setup();
    const { viewport, element, imageIds } = ctx;

    expect(viewport.getCurrentImageIdIndex()).toBe(0);
    const annSlice0 = await drawLength(ctx, [60, 60], [160, 60]);

    await viewport.setImageIdIndex(2);
    expect(viewport.getCurrentImageIdIndex()).toBe(2);
    const annSlice2 = await drawLength(ctx, [60, 200], [160, 200]);

    const all = annotation.state.getAnnotations(LengthTool.toolName, element);
    expect(all.length).toBe(2);
    expect(
      all.map((a: { annotationUID: string }) => a.annotationUID).sort()
    ).toEqual(
      [annSlice0.annotationUID, annSlice2.annotationUID].sort()
    );

    expect(annSlice0.metadata.referencedImageId).toBe(imageIds[0]);
    expect(annSlice2.metadata.referencedImageId).toBe(imageIds[2]);

    // Still on slice 2: only the slice-2 annotation is displayable here.
    let filtered = filterAnnotationsForDisplay(viewport, all);
    expect(filtered.map((a: { annotationUID: string }) => a.annotationUID)).toEqual([
      annSlice2.annotationUID,
    ]);

    await viewport.setImageIdIndex(0);
    expect(viewport.getCurrentImageIdIndex()).toBe(0);
    filtered = filterAnnotationsForDisplay(
      viewport,
      annotation.state.getAnnotations(LengthTool.toolName, element)
    );
    expect(filtered.map((a: { annotationUID: string }) => a.annotationUID)).toEqual([
      annSlice0.annotationUID,
    ]);
  });

  // ==========================================================================
  // 7. Full JSON persistence round trip
  // ==========================================================================
  test('full JSON persistence round trip: counts, world points, stats, and the selection/locking gap', async () => {
    const ctx = await setup();
    const { viewport, element } = ctx;

    const a = await drawLength(ctx, [60, 60], [160, 60]); // slice 0
    const b = await drawLength(ctx, [60, 200], [160, 200]); // slice 0

    await viewport.setImageIdIndex(2);
    const c = await drawLength(ctx, [60, 340], [160, 340]); // slice 2
    await viewport.setImageIdIndex(0);

    annotation.selection.setAnnotationSelected(a.annotationUID, true);
    annotation.locking.setAnnotationLocked(b.annotationUID, true);
    expect(b.isLocked).toBe(true);

    // Post-render, cachedStats have been computed and `invalidated` has been
    // explicitly reset to false (see packages/tools/src/tools/annotation/LengthTool.ts,
    // the `annotation.invalidated = false;` right after computing stats).
    // This is the mechanism pinned below: a restored annotation whose
    // `invalidated` flag survived the JSON round trip as `false` will NOT be
    // recomputed on the next render pass because it already has a
    // `cachedStats[targetId].unit`.
    expect(a.invalidated).toBe(false);

    const preWorldPoints = new Map(
      [a, b, c].map((ann) => [
        ann.annotationUID,
        ann.data.handles.points.map((p: Types.Point3) => [...p]),
      ])
    );
    const preStatsLength = new Map(
      [a, b, c].map((ann) => {
        const targetId = Object.keys(ann.data.cachedStats)[0];
        return [ann.annotationUID, ann.data.cachedStats[targetId].length];
      })
    );

    const serialized = JSON.parse(
      JSON.stringify(annotation.state.getAllAnnotations())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];
    expect(serialized.length).toBe(3);
    serialized.forEach((plain) => expect(plain.invalidated).toBe(false));
    // The serialized clone faithfully captured both flags before anything
    // else runs.
    expect(serialized.find((p) => p.annotationUID === a.annotationUID).isSelected).toBe(
      true
    );
    expect(serialized.find((p) => p.annotationUID === b.annotationUID).isLocked).toBe(
      true
    );

    annotation.state.removeAllAnnotations();
    expect(annotation.state.getAllAnnotations().length).toBe(0);

    // Selection/locking are UID-keyed Sets separate from annotation state
    // (selectedAnnotationUIDs in annotationSelection.ts,
    // globalLockedAnnotationUIDsSet in annotationLocking.ts) and are NOT
    // cleared by removeAllAnnotations -- reset them explicitly via the
    // public API before restoring, exactly as a real persistence layer must.
    annotation.selection.deselectAnnotation();
    annotation.locking.unlockAllAnnotations();
    expect(annotation.selection.getAnnotationsSelected()).toEqual([]);
    expect(annotation.locking.getAnnotationsLocked()).toEqual([]);

    for (const plain of serialized) {
      annotation.state.addAnnotation(plain, element);
    }

    const restored = annotation.state.getAnnotations(
      LengthTool.toolName,
      element
    );
    expect(restored.length).toBe(3);

    for (const ann of restored) {
      const expectedPoints = preWorldPoints.get(ann.annotationUID)!;
      ann.data.handles.points.forEach((p: Types.Point3, i: number) =>
        expectPointCloseTo(p, expectedPoints[i], 6)
      );

      const targetId = Object.keys(ann.data.cachedStats)[0];
      expect(ann.data.cachedStats[targetId].length).toBeCloseTo(
        preStatsLength.get(ann.annotationUID)!,
        6
      );
    }

    const restoredA = restored.find(
      (r: { annotationUID: string }) => r.annotationUID === a.annotationUID
    );
    const restoredB = restored.find(
      (r: { annotationUID: string }) => r.annotationUID === b.annotationUID
    );

    // Pinned persistence-contract finding (report this prominently), and it
    // is NOT symmetric between selection and locking:
    //
    // `isSelected` has no preprocessing hook, so the incoming plain object's
    // flag is left exactly as the JSON clone had it -- it survives as an
    // object property...
    expect(restoredA.isSelected).toBe(true);
    // ...but the public accessor still reads the SEPARATE UID-keyed
    // `selectedAnnotationUIDs` store (annotationSelection.ts), which the
    // restore loop above never repopulated, so it now disagrees with the
    // object's own flag:
    expect(annotation.selection.isAnnotationSelected(a.annotationUID)).toBe(
      false
    );
    //
    // `isLocked` is DIFFERENT and more dangerous: the default annotation
    // manager has a preprocessing hook wired at module load
    // (packages/tools/src/stateManagement/annotation/resetAnnotationManager.ts,
    // `defaultManager.setPreprocessingFn(preprocessingFn)`) that runs on
    // EVERY `addAnnotation()` call and OVERWRITES `annotation.isLocked` with
    // `checkAndSetAnnotationLocked(uid)` -- i.e. the CURRENT (here: just
    // cleared) `locking` store, discarding whatever the incoming object
    // said. So the restored object's `isLocked` does NOT survive even as a
    // property, despite the JSON clone itself having carried `true` (see the
    // `serialized` assertion above) -- it comes back `false`:
    expect(restoredB.isLocked).toBe(false);
    expect(annotation.locking.isAnnotationLocked(b.annotationUID)).toBe(
      false
    );
    //
    // The correct restore procedure is therefore NOT "restore the JSON and
    // trust the flags" for either store -- it is to separately persist
    // `selection.getAnnotationsSelected()` / `locking.getAnnotationsLocked()`
    // and replay them through the public setters (in either order relative
    // to `addAnnotation`, since `setAnnotationLocked`/`setAnnotationSelected`
    // both set the object property AND the store together):
    annotation.selection.setAnnotationSelected(a.annotationUID, true);
    annotation.locking.setAnnotationLocked(b.annotationUID, true);
    expect(annotation.selection.isAnnotationSelected(a.annotationUID)).toBe(
      true
    );
    expect(annotation.locking.isAnnotationLocked(b.annotationUID)).toBe(true);
    expect(restoredA.isSelected).toBe(true);
    expect(restoredB.isLocked).toBe(true);

    // Display filtering still works post-restore.
    const filteredSlice0 = filterAnnotationsForDisplay(viewport, restored);
    expect(
      filteredSlice0
        .map((r: { annotationUID: string }) => r.annotationUID)
        .sort()
    ).toEqual([a.annotationUID, b.annotationUID].sort());

    await viewport.setImageIdIndex(2);
    const filteredSlice2 = filterAnnotationsForDisplay(
      viewport,
      annotation.state.getAnnotations(LengthTool.toolName, element)
    );
    expect(
      filteredSlice2.map((r: { annotationUID: string }) => r.annotationUID)
    ).toEqual([c.annotationUID]);
  });

  // ==========================================================================
  // 8. Annotation event sequence golden
  // ==========================================================================
  test('golden annotation event sequence: draw -> modify -> select -> lock -> hide -> remove', async () => {
    const ctx = await setup();
    const { element } = ctx;

    const TRACKED_EVENTS = [
      ToolsEvents.ANNOTATION_ADDED,
      ToolsEvents.ANNOTATION_MODIFIED,
      ToolsEvents.ANNOTATION_COMPLETED,
      ToolsEvents.ANNOTATION_RENDERED,
      ToolsEvents.ANNOTATION_SELECTION_CHANGE,
      ToolsEvents.ANNOTATION_LOCK_CHANGE,
      ToolsEvents.ANNOTATION_VISIBILITY_CHANGE,
      ToolsEvents.ANNOTATION_REMOVED,
    ];

    const recorded: Array<{ type: string; detail: unknown }> = [];
    const listener = (evt: Event) => {
      recorded.push({ type: evt.type, detail: (evt as CustomEvent).detail });
    };

    // ANNOTATION_RENDERED fires on `element`; every other tracked event
    // fires on the core `eventTarget` singleton (see file header). Both
    // listeners push into the SAME array, which preserves true dispatch
    // order because both are synchronous CustomEvent dispatches on the main
    // thread -- there is no interleaving to reconcile.
    TRACKED_EVENTS.forEach((type) => {
      eventTarget.addEventListener(type, listener);
      element.addEventListener(type, listener);
    });

    try {
      const drawn = await drawLength(ctx, [80, 80], [220, 80]);
      const uid = drawn.annotationUID;

      const handleCanvas = canvasPointOfHandle(ctx, drawn, 0);
      const newCanvas: CanvasPoint = [
        handleCanvas[0] + 30,
        handleCanvas[1] - 20,
      ];
      const rendered = waitForAnnotationRendered(element);
      mouseDrag(element, handleCanvas, newCanvas);
      await rendered;

      annotation.selection.setAnnotationSelected(uid, true);
      annotation.locking.setAnnotationLocked(uid, true);
      // Hiding a SELECTED annotation implicitly deselects it first (see
      // annotationVisibility.ts `hide()`: `if (isAnnotationSelected(uid))
      // deselectAnnotation(uid)` runs before the visibility store is
      // updated), so this single call fires an EXTRA
      // ANNOTATION_SELECTION_CHANGE (removed=[uid]) before
      // ANNOTATION_VISIBILITY_CHANGE -- a genuine, non-obvious coupling
      // between the two stores, verified below.
      annotation.visibility.setAnnotationVisibility(uid, false);
      annotation.state.removeAnnotation(uid);

      const observed = recorded.map((r) => r.type);
      const collapsed = collapseConsecutive(observed);

      // Golden contract, pinned from an actual run of this file (stable
      // across repeated runs; the file's own harness cleanup makes each
      // test independent). Per-step reasoning:
      //   draw:   mousedown -> ANNOTATION_ADDED; mouseDownActivate.ts
      //           auto-selects every newly drawn annotation (see file
      //           header) -> ANNOTATION_SELECTION_CHANGE; each mousemove of
      //           the 2-step drag -> ANNOTATION_MODIFIED (collapsed to one);
      //           mouseup -> ANNOTATION_COMPLETED synchronously, then the
      //           RAF-driven annotation render recomputes cachedStats and
      //           fires a further ANNOTATION_MODIFIED (ChangeTypes.
      //           StatsUpdated, collapsed into the same run), then
      //           ANNOTATION_RENDERED.
      //   modify: handle-drag hit-testing ALSO re-selects the annotation
      //           being dragged (mouseDown.ts `toggleAnnotationSelection`
      //           runs before `handleSelectedCallback`) -> a SECOND
      //           ANNOTATION_SELECTION_CHANGE (added=[uid], removed=[uid],
      //           since it was already selected and preserveSelected
      //           defaults to false); then the drag's mousemove(s) and the
      //           post-render stats recompute -> ANNOTATION_MODIFIED
      //           (collapsed), then ANNOTATION_RENDERED.
      //   select: MY explicit setAnnotationSelected -> a THIRD
      //           ANNOTATION_SELECTION_CHANGE (added=[uid], removed=[uid],
      //           same reason: already selected from the drag above).
      //   lock:   ANNOTATION_LOCK_CHANGE (added=[uid]).
      //   hide:   a FOURTH ANNOTATION_SELECTION_CHANGE (removed=[uid], the
      //           implicit deselect above) followed by
      //           ANNOTATION_VISIBILITY_CHANGE (lastHidden=[uid]).
      //   remove: ANNOTATION_REMOVED.
      const golden = [
        ToolsEvents.ANNOTATION_ADDED,
        ToolsEvents.ANNOTATION_SELECTION_CHANGE,
        ToolsEvents.ANNOTATION_MODIFIED,
        ToolsEvents.ANNOTATION_COMPLETED,
        ToolsEvents.ANNOTATION_MODIFIED,
        ToolsEvents.ANNOTATION_RENDERED,
        ToolsEvents.ANNOTATION_SELECTION_CHANGE,
        ToolsEvents.ANNOTATION_MODIFIED,
        ToolsEvents.ANNOTATION_RENDERED,
        ToolsEvents.ANNOTATION_SELECTION_CHANGE,
        ToolsEvents.ANNOTATION_LOCK_CHANGE,
        ToolsEvents.ANNOTATION_SELECTION_CHANGE,
        ToolsEvents.ANNOTATION_VISIBILITY_CHANGE,
        ToolsEvents.ANNOTATION_REMOVED,
      ];

      expectOrderedSubsequence(collapsed, golden);

      // Targeted assertions on all four ANNOTATION_SELECTION_CHANGE events
      // (auto-select-on-draw, re-select-on-handle-drag, the explicit select,
      // then the implicit deselect-on-hide) and the terminal
      // ANNOTATION_REMOVED, using the FULL (uncollapsed) detail so the
      // added/removed arrays are checked precisely.
      const selectionChanges = recorded.filter(
        (r) => r.type === ToolsEvents.ANNOTATION_SELECTION_CHANGE
      );
      expect(selectionChanges.length).toBe(4);
      expect(
        (selectionChanges[0].detail as { added: string[]; removed: string[] })
      ).toEqual(
        expect.objectContaining({ added: [uid], removed: [] })
      );
      expect(
        (selectionChanges[1].detail as { added: string[]; removed: string[] })
      ).toEqual(
        expect.objectContaining({ added: [uid], removed: [uid] })
      );
      expect(
        (selectionChanges[2].detail as { added: string[]; removed: string[] })
      ).toEqual(
        expect.objectContaining({ added: [uid], removed: [uid] })
      );
      expect(
        (selectionChanges[3].detail as { added: string[]; removed: string[] })
      ).toEqual(
        expect.objectContaining({ added: [], removed: [uid] })
      );

      const removedEvent = recorded.find(
        (r) => r.type === ToolsEvents.ANNOTATION_REMOVED
      );
      expect(
        (removedEvent?.detail as { annotation: { annotationUID: string } })
          .annotation.annotationUID
      ).toBe(uid);
    } finally {
      TRACKED_EVENTS.forEach((type) => {
        eventTarget.removeEventListener(type, listener);
        element.removeEventListener(type, listener);
      });
    }
  });
});
