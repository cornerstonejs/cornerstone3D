import type { Types } from '@cornerstonejs/core';
import {
  cache,
  CONSTANTS,
  Enums,
  eventTarget,
  getEnabledElementByViewportId,
  triggerEvent,
  utilities,
} from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import {
  getAddOns,
  getPolySeg,
  type SurfaceClipResult,
  type SurfacesInfo,
} from '../../../config';
import {
  getAnnotation,
  removeAnnotation,
} from '../../../stateManagement/annotation/annotationState';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import type { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { SegmentationContourCutsCompletedEventDetail } from '../../../types/EventTypes';
import { Events } from '../../../enums';
import { triggerAnnotationRenderForViewportIds } from '../../../utilities/triggerAnnotationRenderForViewportIds';

const cs3dLogger = utilities.logger.toolsLog.getLogger(
  'tools',
  'displayTools',
  'Contour',
  'contourCuts'
);

/**
 * Two normals give one plane when their dot product is above this, the rule
 * by which a viewport in volume mode shows an annotation of its plane.
 */
const PARALLEL_THRESHOLD = 1 - CONSTANTS.EPSILON;

/**
 * How long the plane of a viewport stays the same before the contours are cut
 * again, after a rotation or a change of orientation: a drag of the rotation
 * cuts the last plane, not each plane on the way.
 */
const PLANE_SETTLE_DELAY = 150;

/**
 * The contour annotations of one slice of a cut, and the viewports that show
 * that slice.
 */
type ShownSlice = {
  annotationUIDs: string[];
  viewportIds: Set<string>;
};

/**
 * The cut of the surfaces of a segmentation by the slices of one plane
 * orientation of one volume or stack: the contours of each slice by segment,
 * which grow as the surfaces of the segments are made and cut, the surfaces
 * that wait for the cut that is running, and the contour annotations of the
 * slices that the viewports of that plane show. The viewports of one plane
 * share it. It is finished when every segment that needs a cut in the plane
 * is cut (`cutSegmentIndices`) or has failed (`failedSegmentIndices`), and
 * each viewport of the plane is told so once (`announcedViewportIds`).
 */
type PlaneCut = {
  key: string;
  segmentationId: string;
  viewportIds: Set<string>;
  slices?: Map<number, Map<number, SurfaceClipResult[]>>;
  shownSlices: Map<number, ShownSlice>;
  sliceOfViewport: Map<string, number>;
  waitingSurfaces: SurfacesInfo[];
  cutting: Promise<void>;
  released: boolean;
  done: Promise<void>;
  finished: boolean;
  cutSegmentIndices: Set<number>;
  failedSegmentIndices: Set<number>;
  announcedViewportIds: Set<string>;
};

/**
 * What the cuts keep of one segmentation: the surface of each segment, made
 * once per version of its contours, the failures already reported for that
 * version, and the cuts by plane. The segmentation itself is read from the
 * segmentation state at each use: the state gives a new object for every
 * segmentation at each change of any of them.
 */
type SegmentationCuts = {
  segmentationId: string;
  version: number;
  removed: boolean;
  surfaces: Map<number, Promise<SurfacesInfo | undefined>>;
  convertedGeometryIds: Set<string>;
  reported: Set<string>;
  planeCuts: Map<string, PlaneCut>;
};

/**
 * The cut that a viewport shows of each segmentation, the listener that
 * follows its slice and its plane, and the timer of a pending change of plane.
 */
type ViewportCuts = {
  element: HTMLDivElement;
  planeCuts: Map<string, PlaneCut>;
  onViewChanged: () => void;
  timer?: ReturnType<typeof setTimeout>;
};

/** The events after which a viewport may show another slice or plane. */
const VIEW_EVENTS = [
  Enums.Events.CAMERA_MODIFIED,
  Enums.Events.IMAGE_RENDERED,
] as const;

const cutsBySegmentation = new Map<string, SegmentationCuts>();
const cutsByViewport = new Map<string, ViewportCuts>();

/**
 * The last conversion of each segment that is asked or running, by
 * segmentation id and segment index: the conversion of a newer version of the
 * contours of a segment runs after it, as both put their surface in the cache
 * under one geometry id.
 */
const conversionsInFlight = new Map<string, Promise<unknown>>();

/**
 * Draws the contours of a contour segmentation on a viewport whose plane is
 * not the plane of the contours, as the cut of the surface of each segment
 * by the slices of the viewport.
 *
 * A segment whose contours lie in the plane of the viewport is drawn by its
 * own contours and is not cut. The plane of a contour is the one of its
 * points, as the view plane normal of its annotation says. For the others the
 * PolySeg add-on makes a surface from the contours (once per segment and per
 * version of the contours; a Surface representation of the segmentation is
 * used as it is) and cuts it with every slice of the viewport in one pass of
 * its worker. The cut of the slice on display is a set of contour annotations
 * with the view reference of that slice; a scroll replaces them by the ones of
 * the next slice from the kept cut, with no new cut, so the annotations of a
 * cut are only those of the slices on display. The viewport cuts again when
 * its plane changes (a rotation, another orientation, another volume) or
 * when the contours change; the cuts of the plane it left go.
 *
 * Nothing is cut on a viewport without slices (a 3D viewport). A segment that
 * cannot be converted is reported once per version of its contours: a warning
 * that names the segmentation, the segment and the reason.
 *
 * @param viewport - The viewport that shows the contour representation.
 * @param segmentationId - The id of the contour segmentation.
 * @returns A promise that resolves when the cut of the current plane is drawn.
 */
function updateContourCuts(
  viewport: Types.IViewport,
  segmentationId: string
): Promise<void> {
  if (viewport.type === Enums.ViewportType.VOLUME_3D) {
    return Promise.resolve();
  }

  if (!getSegmentationCuts(segmentationId)) {
    return Promise.resolve();
  }

  const viewportCuts = getViewportCuts(viewport);
  if (!viewportCuts.planeCuts.has(segmentationId)) {
    viewportCuts.planeCuts.set(segmentationId, undefined);
  }

  return updateViewportCut(viewport, segmentationId);
}

/**
 * Takes the cuts of a segmentation off a viewport: the viewport stops
 * sharing them, and they go when no other viewport shows them. The viewport
 * stops following its plane when it shows no cut any more.
 *
 * @param viewportId - The id of the viewport.
 * @param segmentationId - The id of the segmentation.
 */
function removeContourCuts(viewportId: string, segmentationId: string): void {
  const viewportCuts = cutsByViewport.get(viewportId);

  if (!viewportCuts?.planeCuts.has(segmentationId)) {
    return;
  }

  releasePlaneCut(
    segmentationId,
    viewportCuts.planeCuts.get(segmentationId),
    viewportId
  );
  viewportCuts.planeCuts.delete(segmentationId);

  if (!viewportCuts.planeCuts.size) {
    releaseViewportCuts(viewportId, viewportCuts);
  }
}

/**
 * Takes every cut off a viewport whose element is disabled. The tools call it
 * on ELEMENT_DISABLED, so a viewport made again under the same id cuts again
 * and finds no cut of the one before it.
 *
 * @param viewportId - The id of the viewport.
 */
function removeContourCutsOfViewport(viewportId: string): void {
  const viewportCuts = cutsByViewport.get(viewportId);

  if (!viewportCuts) {
    return;
  }

  [...viewportCuts.planeCuts.keys()].forEach((segmentationId) =>
    removeContourCuts(viewportId, segmentationId)
  );
  releaseViewportCuts(viewportId, viewportCuts);
}

/**
 * The cuts of a viewport, made at the first call with the listener that
 * follows the plane of the viewport at each render.
 */
function getViewportCuts(viewport: Types.IViewport): ViewportCuts {
  const existing = cutsByViewport.get(viewport.id);

  if (existing?.element === viewport.element) {
    return existing;
  }

  if (existing) {
    removeContourCutsOfViewport(viewport.id);
  }

  const viewportCuts: ViewportCuts = {
    element: viewport.element,
    planeCuts: new Map(),
    onViewChanged: () => onViewChanged(viewport.id),
  };

  cutsByViewport.set(viewport.id, viewportCuts);
  VIEW_EVENTS.forEach((eventName) =>
    viewport.element.addEventListener(eventName, viewportCuts.onViewChanged)
  );

  return viewportCuts;
}

function releaseViewportCuts(
  viewportId: string,
  viewportCuts: ViewportCuts
): void {
  clearTimeout(viewportCuts.timer);
  VIEW_EVENTS.forEach((eventName) =>
    viewportCuts.element.removeEventListener(
      eventName,
      viewportCuts.onViewChanged
    )
  );

  if (cutsByViewport.get(viewportId) === viewportCuts) {
    cutsByViewport.delete(viewportId);
  }
}

/**
 * After a change of the camera or a render of a viewport. On the plane of its
 * cuts (a scroll, a pan, a zoom) it shows the cut of the slice on display,
 * from the kept cut. On another plane it cuts again once the plane stays the
 * same for `PLANE_SETTLE_DELAY`.
 */
function onViewChanged(viewportId: string): void {
  const viewportCuts = cutsByViewport.get(viewportId);
  const viewport = getEnabledElementByViewportId(viewportId)?.viewport;

  if (!viewportCuts || !viewport) {
    return;
  }

  const planeKey = getPlaneKey(viewport);
  let outdated = false;

  viewportCuts.planeCuts.forEach((planeCut, segmentationId) => {
    if (!planeKey || !getSegmentation(segmentationId)) {
      return;
    }

    if (planeCut?.key === getPlaneCutKey(segmentationId, planeKey)) {
      showSliceOfViewport(planeCut, viewport);
    } else {
      outdated = true;
    }
  });

  if (!outdated) {
    return;
  }

  clearTimeout(viewportCuts.timer);
  viewportCuts.timer = setTimeout(() => {
    viewportCuts.timer = undefined;
    [...viewportCuts.planeCuts.keys()].forEach((segmentationId) =>
      updateViewportCut(viewport, segmentationId)
    );
  }, PLANE_SETTLE_DELAY);
}

/**
 * Gives the viewport the cut of the segmentation for its current plane: the
 * one that a viewport of the same plane made, or a new one. The viewport
 * leaves the cut of its former plane.
 */
function updateViewportCut(
  viewport: Types.IViewport,
  segmentationId: string
): Promise<void> {
  const viewportCuts = cutsByViewport.get(viewport.id);
  const planeKey = getPlaneKey(viewport);
  const segmentationCuts = getSegmentationCuts(segmentationId);

  if (!viewportCuts || !planeKey || !segmentationCuts) {
    return Promise.resolve();
  }

  const key = getPlaneCutKey(segmentationId, planeKey);
  const current = viewportCuts.planeCuts.get(segmentationId);

  if (current?.key === key) {
    showSliceOfViewport(current, viewport);
    return current.done;
  }

  let planeCut = segmentationCuts.planeCuts.get(key);

  if (!planeCut) {
    const newPlaneCut: PlaneCut = {
      key,
      segmentationId,
      viewportIds: new Set(),
      shownSlices: new Map(),
      sliceOfViewport: new Map(),
      waitingSurfaces: [],
      cutting: Promise.resolve(),
      released: false,
      done: undefined,
      finished: false,
      cutSegmentIndices: new Set(),
      failedSegmentIndices: new Set(),
      announcedViewportIds: new Set(),
    };

    planeCut = newPlaneCut;
    segmentationCuts.planeCuts.set(key, planeCut);
    planeCut.done = cutPlane(
      segmentationId,
      segmentationCuts,
      planeCut,
      viewport
    )
      .catch((error) =>
        report(segmentationCuts, 'all', `the cut failed: ${describe(error)}`)
      )
      .then(() => {
        newPlaneCut.finished = true;
      });
  }

  const shownPlaneCut = planeCut;

  planeCut.viewportIds.add(viewport.id);
  viewportCuts.planeCuts.set(segmentationId, planeCut);
  releasePlaneCut(segmentationId, current, viewport.id);
  showSliceOfViewport(planeCut, viewport);
  planeCut.done.then(() => announceContourCuts(viewport.id, shownPlaneCut));

  return planeCut.done;
}

/**
 * Whether the cuts of a segmentation on a viewport are all drawn for the
 * plane on display, by what the cuts keep: `'pending'` while the viewport
 * has not cut its plane for the current contours yet (no render of the
 * representation since it was added or since the contours changed, or a
 * change of plane that waits for the plane to settle) or while a conversion
 * or a cut of that plane runs; `'complete'` otherwise, also for a viewport
 * that cannot show a cut (a 3D viewport, one that shows nothing) and for a
 * segmentation without contours. A scroll keeps the plane, so it keeps the
 * state. Only the contour sets of a segmentation (`geometryIds`, as an
 * RTSTRUCT gives them) are cut, so a segmentation without them is complete.
 * Whether the viewport shows the representation at all is
 * `segmentation.getContourCutsState`.
 *
 * @param viewportId - The id of the viewport.
 * @param segmentationId - The id of the segmentation.
 */
function getViewportContourCutsState(
  viewportId: string,
  segmentationId: string
): 'pending' | 'complete' {
  const viewport = getEnabledElementByViewportId(viewportId)?.viewport;

  if (
    !viewport ||
    viewport.type === Enums.ViewportType.VOLUME_3D ||
    !getSegmentation(segmentationId)?.representationData.Contour?.geometryIds
      ?.length
  ) {
    return 'complete';
  }

  const planeKey = getPlaneKey(viewport);

  if (!planeKey) {
    return 'complete';
  }

  const planeCut = cutsByViewport
    .get(viewportId)
    ?.planeCuts.get(segmentationId);

  return planeCut?.finished &&
    !planeCut.released &&
    planeCut.key === getPlaneCutKey(segmentationId, planeKey)
    ? 'complete'
    : 'pending';
}

/**
 * Fires `SEGMENTATION_CONTOUR_CUTS_COMPLETED` for a viewport whose cut of its
 * plane is finished, once per cut and viewport, at the next animation frame:
 * the annotation render that the last cut asked for draws in that frame
 * before it, so the contours of the slice on display are drawn when the
 * event fires. Nothing fires when the viewport left the cut or its cut is
 * pending again by then (a change of plane or of the contours): the next cut
 * fires.
 */
function announceContourCuts(viewportId: string, planeCut: PlaneCut): void {
  window.requestAnimationFrame(() => {
    const { segmentationId } = planeCut;

    if (
      planeCut.announcedViewportIds.has(viewportId) ||
      cutsByViewport.get(viewportId)?.planeCuts.get(segmentationId) !==
        planeCut ||
      getViewportContourCutsState(viewportId, segmentationId) !== 'complete'
    ) {
      return;
    }

    planeCut.announcedViewportIds.add(viewportId);

    const sorted = (indices: Set<number>) => [...indices].sort((a, b) => a - b);
    const detail: SegmentationContourCutsCompletedEventDetail = {
      viewportId,
      segmentationId,
      segmentIndices: sorted(planeCut.cutSegmentIndices),
      failedSegmentIndices: sorted(planeCut.failedSegmentIndices),
    };

    triggerEvent(
      eventTarget,
      Events.SEGMENTATION_CONTOUR_CUTS_COMPLETED,
      detail
    );
  });
}

/**
 * Shows on a viewport the cut of the slice on display: the contour
 * annotations of that slice, made from the contours cut so far when no other
 * viewport of the plane shows it, in place of the ones of the slice that it
 * showed before. Nothing before the cut of the plane starts.
 */
function showSliceOfViewport(planeCut: PlaneCut, viewport: Types.IViewport) {
  const sliceIndex = (
    viewport as Types.IViewport & { getSliceIndex?: () => number }
  ).getSliceIndex?.();

  if (
    !planeCut.slices ||
    planeCut.released ||
    planeCut.sliceOfViewport.get(viewport.id) === sliceIndex
  ) {
    return;
  }

  hideSliceOfViewport(planeCut, viewport.id);

  if (sliceIndex === undefined) {
    return;
  }

  let shownSlice = planeCut.shownSlices.get(sliceIndex);

  if (!shownSlice) {
    shownSlice = {
      annotationUIDs: addSliceAnnotations(
        planeCut.segmentationId,
        planeCut.slices.get(sliceIndex),
        viewport
      ),
      viewportIds: new Set(),
    };
    planeCut.shownSlices.set(sliceIndex, shownSlice);
  }

  shownSlice.viewportIds.add(viewport.id);
  planeCut.sliceOfViewport.set(viewport.id, sliceIndex);
  triggerAnnotationRenderForViewportIds([viewport.id]);
}

/**
 * Lets a viewport leave the slice that it shows; the annotations of the slice
 * go when no viewport of the plane shows it any more.
 */
function hideSliceOfViewport(planeCut: PlaneCut, viewportId: string): void {
  const sliceIndex = planeCut.sliceOfViewport.get(viewportId);

  if (sliceIndex === undefined) {
    return;
  }

  planeCut.sliceOfViewport.delete(viewportId);

  const shownSlice = planeCut.shownSlices.get(sliceIndex);
  shownSlice?.viewportIds.delete(viewportId);

  if (shownSlice && !shownSlice.viewportIds.size) {
    shownSlice.annotationUIDs.forEach((annotationUID) =>
      removeAnnotation(annotationUID)
    );
    planeCut.shownSlices.delete(sliceIndex);
  }
}

/**
 * Adds the contours of one slice of a cut as locked contour annotations with
 * the view reference of that slice, and gives their UIDs.
 */
function addSliceAnnotations(
  segmentationId: string,
  contours: Map<number, SurfaceClipResult[]> | undefined,
  viewport: Types.IViewport
): string[] {
  const annotationUIDs: string[] = [];

  if (!contours?.size) {
    return annotationUIDs;
  }

  getPolySeg()
    .createAndAddContourSegmentationsFromClippedSurfaces(
      contours,
      viewport,
      segmentationId
    )
    ?.forEach((uids) =>
      uids.forEach((annotationUID) => {
        const annotation = getAnnotation(annotationUID);

        if (annotation) {
          annotation.isLocked = true;
        }
        annotationUIDs.push(annotationUID);
      })
    );

  return annotationUIDs;
}

/**
 * Lets a viewport leave a cut; the annotations of the cut go when no viewport
 * shows it any more, and a cut that is still running adds none.
 */
function releasePlaneCut(
  segmentationId: string,
  planeCut: PlaneCut | undefined,
  viewportId: string
): void {
  if (!planeCut) {
    return;
  }

  hideSliceOfViewport(planeCut, viewportId);
  planeCut.viewportIds.delete(viewportId);
  planeCut.announcedViewportIds.delete(viewportId);

  if (planeCut.viewportIds.size) {
    return;
  }

  planeCut.released = true;
  planeCut.shownSlices.forEach(({ annotationUIDs }) =>
    annotationUIDs.forEach((annotationUID) => removeAnnotation(annotationUID))
  );
  planeCut.shownSlices.clear();
  planeCut.sliceOfViewport.clear();

  const segmentationCuts = cutsBySegmentation.get(segmentationId);
  if (segmentationCuts?.planeCuts.get(planeCut.key) === planeCut) {
    segmentationCuts.planeCuts.delete(planeCut.key);
  }
}

/**
 * Cuts the surfaces of the segments that do not lie in the plane of the
 * viewport with every slice of the viewport, and shows the cut of the slice on
 * display of each viewport of the plane as it grows: each surface is cut as
 * soon as it is made, with the others made while the cut before it ran, and
 * the contours of those segments are added to the slices on display. The
 * segments are converted in the order of `getConversionOrder`. The cut of a
 * plane that no viewport shows any more adds nothing.
 */
async function cutPlane(
  segmentationId: string,
  segmentationCuts: SegmentationCuts,
  planeCut: PlaneCut,
  viewport: Types.IViewport
): Promise<void> {
  const viewPlaneNormal = viewport.getViewReference().viewPlaneNormal;
  const segmentIndices = getSegmentsToCut(
    segmentationCuts,
    viewPlaneNormal,
    planeCut
  );

  if (!segmentIndices.length) {
    return;
  }

  const polySeg = getAvailablePolySeg(segmentationCuts, segmentIndices);
  if (!polySeg) {
    segmentIndices.forEach((segmentIndex) =>
      planeCut.failedSegmentIndices.add(segmentIndex)
    );
    return;
  }

  planeCut.slices = new Map();

  await Promise.all(
    getConversionOrder(segmentationCuts, segmentIndices, viewport).map(
      (segmentIndex) =>
        getSegmentSurface(segmentationCuts, segmentIndex, viewport)
          .then((surface) => {
            if (!surface) {
              planeCut.failedSegmentIndices.add(segmentIndex);
              return;
            }

            return queueCut(planeCut, surface, polySeg).then(() => {
              planeCut.cutSegmentIndices.add(segmentIndex);
            });
          })
          .catch((error) => {
            planeCut.failedSegmentIndices.add(segmentIndex);
            report(
              segmentationCuts,
              'all',
              `the cut failed: ${describe(error)}`
            );
          })
    )
  );
}

/**
 * Puts a surface in the queue of the cut of a plane. A cut takes every
 * surface that waits when it starts, so the surfaces made while one cut runs
 * go into the next one together.
 */
function queueCut(
  planeCut: PlaneCut,
  surface: SurfacesInfo,
  polySeg: ReturnType<typeof getPolySeg>
): Promise<void> {
  planeCut.waitingSurfaces.push(surface);
  planeCut.cutting = planeCut.cutting
    .catch(() => undefined)
    .then(() => cutWaitingSurfaces(planeCut, polySeg));

  return planeCut.cutting;
}

/**
 * Cuts the surfaces that wait with every slice of the plane, in one task of
 * the worker, keeps their contours by slice, and adds the contours of each
 * slice on display to the annotations of that slice.
 */
async function cutWaitingSurfaces(
  planeCut: PlaneCut,
  polySeg: ReturnType<typeof getPolySeg>
): Promise<void> {
  const surfaces = planeCut.waitingSurfaces.splice(0);
  const viewport = [...planeCut.viewportIds]
    .map((viewportId) => getEnabledElementByViewportId(viewportId)?.viewport)
    .find(Boolean);

  if (!surfaces.length || planeCut.released || !viewport) {
    return;
  }

  const clipped = await polySeg.clipAndCacheSurfacesForViewport(
    surfaces,
    viewport
  );

  if (planeCut.released) {
    return;
  }

  const cutSlices = groupBySlice(polySeg.extractContourData(clipped));

  cutSlices.forEach((contours, sliceIndex) => {
    const slice = planeCut.slices.get(sliceIndex) ?? new Map();

    contours.forEach((segmentContours, segmentIndex) =>
      slice.set(segmentIndex, segmentContours)
    );
    planeCut.slices.set(sliceIndex, slice);
  });

  planeCut.shownSlices.forEach((shownSlice, sliceIndex) => {
    const shownViewport = [...shownSlice.viewportIds]
      .map((viewportId) => getEnabledElementByViewportId(viewportId)?.viewport)
      .find(Boolean);

    if (shownViewport) {
      shownSlice.annotationUIDs.push(
        ...addSliceAnnotations(
          planeCut.segmentationId,
          cutSlices.get(sliceIndex),
          shownViewport
        )
      );
    }
  });

  planeCut.viewportIds.forEach((viewportId) => {
    const planeViewport = getEnabledElementByViewportId(viewportId)?.viewport;

    if (planeViewport) {
      showSliceOfViewport(planeCut, planeViewport);
    }
  });
  triggerAnnotationRenderForViewportIds([...planeCut.viewportIds]);
}

/** The contours of a cut by slice, and in each slice by segment. */
function groupBySlice(
  contoursBySegment: Map<number, SurfaceClipResult[]>
): Map<number, Map<number, SurfaceClipResult[]>> {
  const slices = new Map<number, Map<number, SurfaceClipResult[]>>();

  contoursBySegment.forEach((contours, segmentIndex) =>
    contours.forEach((contour) => {
      if (!slices.has(contour.sliceIndex)) {
        slices.set(contour.sliceIndex, new Map());
      }

      const slice = slices.get(contour.sliceIndex);
      if (!slice.has(segmentIndex)) {
        slice.set(segmentIndex, []);
      }
      slice.get(segmentIndex).push(contour);
    })
  );

  return slices;
}

/**
 * The segments of a segmentation that a viewport of this normal shows as a
 * cut: those whose contours do not lie in its plane. A segment with contours
 * on planes that are not parallel cannot be made into a surface; it is
 * reported, counted as failed in the cut of the plane, and not cut, and its
 * contours of the plane of the viewport show.
 */
function getSegmentsToCut(
  segmentationCuts: SegmentationCuts,
  viewPlaneNormal: Types.Point3,
  planeCut: PlaneCut
): number[] {
  const annotationUIDsMap = getSegmentation(segmentationCuts.segmentationId)
    ?.representationData.Contour?.annotationUIDsMap;
  const segmentIndices: number[] = [];

  annotationUIDsMap?.forEach((annotationUIDs, segmentIndex) => {
    const normals = [...annotationUIDs]
      .map(
        (annotationUID) =>
          (getAnnotation(annotationUID) as ContourSegmentationAnnotation)
            ?.metadata?.viewPlaneNormal
      )
      .filter(Boolean);

    if (!normals.length) {
      return;
    }

    if (normals.some((normal) => !isParallel(normal, normals[0]))) {
      planeCut.failedSegmentIndices.add(segmentIndex);
      report(
        segmentationCuts,
        segmentIndex,
        'its contours lie on planes that are not parallel, which the conversion to a surface does not support'
      );
      return;
    }

    if (!isParallel(normals[0], viewPlaneNormal)) {
      segmentIndices.push(segmentIndex);
    }
  });

  return segmentIndices;
}

/**
 * The order in which the segments of a plane are converted: first the ones
 * whose contours reach the slice that the viewport shows, then the others,
 * and in each group the ones with fewer contour points first, as a
 * conversion takes longer for more points. The worker converts in the order
 * asked, so the first cuts come soon and where the viewport looks.
 */
function getConversionOrder(
  segmentationCuts: SegmentationCuts,
  segmentIndices: number[],
  viewport: Types.IViewport
): number[] {
  const { viewPlaneNormal, cameraFocalPoint } = viewport.getViewReference();
  const annotationUIDsMap = getSegmentation(segmentationCuts.segmentationId)
    ?.representationData.Contour?.annotationUIDsMap;
  const depthOfSlice = cameraFocalPoint
    ? vec3.dot(cameraFocalPoint, viewPlaneNormal)
    : undefined;
  const segments = segmentIndices.map((segmentIndex) => {
    let points = 0;
    let nearest = Infinity;
    let farthest = -Infinity;

    annotationUIDsMap?.get(segmentIndex)?.forEach((annotationUID) => {
      const polyline =
        (getAnnotation(annotationUID) as ContourSegmentationAnnotation)?.data
          ?.contour?.polyline ?? [];

      points += polyline.length;
      polyline.forEach((point) => {
        const depth = vec3.dot(point, viewPlaneNormal);

        nearest = Math.min(nearest, depth);
        farthest = Math.max(farthest, depth);
      });
    });

    return {
      segmentIndex,
      points,
      onSlice:
        depthOfSlice !== undefined &&
        nearest <= depthOfSlice &&
        depthOfSlice <= farthest,
    };
  });

  return segments
    .sort(
      (a, b) => Number(b.onSlice) - Number(a.onSlice) || a.points - b.points
    )
    .map(({ segmentIndex }) => segmentIndex);
}

/**
 * The PolySeg add-on, or undefined after one report for each segment that
 * would need it.
 */
function getAvailablePolySeg(
  segmentationCuts: SegmentationCuts,
  segmentIndices: number[]
): ReturnType<typeof getPolySeg> | undefined {
  if (!getAddOns()?.polySeg) {
    segmentIndices.forEach((segmentIndex) =>
      report(
        segmentationCuts,
        segmentIndex,
        'the PolySeg add-on is not registered; register it with cornerstoneTools.init({ addons: { polySeg } }) to draw contours on planes other than their own'
      )
    );
    return;
  }

  return getPolySeg();
}

/**
 * The surface of a segment: the one of the Surface representation of the
 * segmentation when it has one, else the one that the PolySeg add-on makes
 * from the contours, once per version of the contours. A conversion that
 * fails or gives no surface is reported and gives undefined.
 */
function getSegmentSurface(
  segmentationCuts: SegmentationCuts,
  segmentIndex: number,
  viewport: Types.IViewport
): Promise<SurfacesInfo | undefined> {
  const representedSurface = getRepresentedSurface(
    getSegmentation(segmentationCuts.segmentationId),
    segmentIndex
  );

  if (representedSurface) {
    return Promise.resolve(representedSurface);
  }

  if (!segmentationCuts.surfaces.has(segmentIndex)) {
    segmentationCuts.surfaces.set(
      segmentIndex,
      convertSegment(segmentationCuts, segmentIndex, viewport)
    );
  }

  return segmentationCuts.surfaces.get(segmentIndex);
}

function getRepresentedSurface(
  segmentation: Segmentation | undefined,
  segmentIndex: number
): SurfacesInfo | undefined {
  const geometryId =
    segmentation?.representationData.Surface?.geometryIds?.get(segmentIndex);
  const surface = geometryId
    ? (cache.getGeometry(geometryId)?.data as Types.ISurface)
    : undefined;

  if (!surface?.points?.length) {
    return;
  }

  return {
    id: geometryId,
    points: surface.points,
    polys: surface.polys,
    segmentIndex,
  };
}

/**
 * Converts the contours of a segment to a surface for the version of the
 * contours at the time of the call. The conversion waits for the one of an
 * older version of the segment that is still running; a version that is no
 * longer current by the time its turn comes is not converted, and the surface
 * of one that became old while it ran leaves the cache.
 */
function convertSegment(
  segmentationCuts: SegmentationCuts,
  segmentIndex: number,
  viewport: Types.IViewport
): Promise<SurfacesInfo | undefined> {
  const key = `${segmentationCuts.segmentationId}|${segmentIndex}`;
  const { version } = segmentationCuts;
  const conversion = (conversionsInFlight.get(key) ?? Promise.resolve()).then(
    () => runConversion(segmentationCuts, segmentIndex, version, viewport)
  );

  conversionsInFlight.set(key, conversion);
  conversion.then(() => {
    if (conversionsInFlight.get(key) === conversion) {
      conversionsInFlight.delete(key);
    }
  });

  return conversion;
}

async function runConversion(
  segmentationCuts: SegmentationCuts,
  segmentIndex: number,
  version: number,
  viewport: Types.IViewport
): Promise<SurfacesInfo | undefined> {
  const { segmentationId } = segmentationCuts;
  const isOutdated = () =>
    segmentationCuts.removed || segmentationCuts.version !== version;

  if (isOutdated()) {
    return;
  }

  try {
    const { geometryIds } = await getPolySeg().computeSurfaceData(
      segmentationId,
      { segmentIndices: [segmentIndex], viewport }
    );
    const geometryId = geometryIds?.get(segmentIndex);
    const surface = geometryId
      ? (cache.getGeometry(geometryId)?.data as Types.ISurface)
      : undefined;

    if (isOutdated()) {
      removeConvertedGeometry(segmentationId, geometryId);
      return;
    }

    if (geometryId) {
      segmentationCuts.convertedGeometryIds.add(geometryId);
    }

    if (!surface?.points?.length) {
      report(
        segmentationCuts,
        segmentIndex,
        'the conversion of its contours gave no surface'
      );
      return;
    }

    return {
      id: geometryId,
      points: surface.points,
      polys: surface.polys,
      segmentIndex,
    };
  } catch (error) {
    if (!isOutdated()) {
      report(
        segmentationCuts,
        segmentIndex,
        `the conversion of its contours to a surface failed: ${describe(error)}`
      );
    }
  }
}

/**
 * What the cuts keep of a segmentation, made at the first call. A
 * segmentation that is removed loses it (`removeContourCutsOfSegmentation` on
 * SEGMENTATION_REMOVED), so one added again under the same id starts again.
 */
function getSegmentationCuts(
  segmentationId: string
): SegmentationCuts | undefined {
  if (!getSegmentation(segmentationId)?.representationData.Contour) {
    return;
  }

  const existing = cutsBySegmentation.get(segmentationId);
  if (existing) {
    return existing;
  }

  const segmentationCuts: SegmentationCuts = {
    segmentationId,
    version: 0,
    removed: false,
    surfaces: new Map(),
    convertedGeometryIds: new Set(),
    reported: new Set(),
    planeCuts: new Map(),
  };
  cutsBySegmentation.set(segmentationId, segmentationCuts);

  return segmentationCuts;
}

/**
 * The key of the cut of a segmentation for a plane: the plane and the
 * version of the contours, so a change of either makes a new cut.
 */
function getPlaneCutKey(segmentationId: string, planeKey: string): string {
  return `${planeKey}|${cutsBySegmentation.get(segmentationId)?.version ?? 0}`;
}

/**
 * The plane of a viewport as its cuts depend on it: the content (the volume,
 * or the images of the stack) and the view plane normal. A scroll, a pan and
 * a zoom keep it. Undefined while the viewport shows nothing that has slices.
 */
function getPlaneKey(viewport: Types.IViewport): string | undefined {
  const mode = utilities.getViewportContentMode(viewport);
  const sliceViewport = viewport as Types.IViewport & {
    getVolumeId?: () => string | undefined;
    getImageIds?: () => string[];
  };
  const imageIds = mode === 'stack' ? sliceViewport.getImageIds?.() : [];
  const content =
    mode === 'volume'
      ? sliceViewport.getVolumeId?.()
      : imageIds?.length
        ? `${imageIds.length}|${imageIds[0]}|${imageIds[imageIds.length - 1]}`
        : undefined;
  const viewPlaneNormal = content
    ? viewport.getViewReference()?.viewPlaneNormal
    : undefined;

  if (!viewPlaneNormal) {
    return;
  }

  return `${mode}|${content}|${viewPlaneNormal
    .map((value) => Math.round(value * 1e4) / 1e4 + 0)
    .join(',')}`;
}

function isParallel(a: Types.Point3, b: Types.Point3): boolean {
  return Math.abs(vec3.dot(a, b)) > PARALLEL_THRESHOLD;
}

/**
 * Reports a segment that gets no cut, once per reason and per version of the
 * contours of the segmentation.
 */
function report(
  segmentationCuts: SegmentationCuts,
  segmentIndex: number | 'all',
  reason: string
): void {
  const key = `${segmentIndex}|${reason}`;

  if (segmentationCuts.reported.has(key)) {
    return;
  }

  segmentationCuts.reported.add(key);
  cs3dLogger.warn(
    `The contours of segmentation ${segmentationCuts.segmentationId}${
      segmentIndex === 'all' ? '' : `, segment ${segmentIndex},`
    } are not drawn on planes other than their own: ${reason}.`
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A new version of the contours of a segmentation: its surfaces are made
 * again and its failures reported again. The viewports cut again at the
 * next render of the representation, and leave the cuts of the old version.
 * The tools call it on SEGMENTATION_DATA_MODIFIED.
 *
 * @param segmentationId - The id of the segmentation.
 */
function updateContourCutsOfModifiedSegmentation(segmentationId: string): void {
  const segmentationCuts = cutsBySegmentation.get(segmentationId);

  if (!segmentationCuts) {
    return;
  }

  segmentationCuts.version++;
  segmentationCuts.surfaces.clear();
  segmentationCuts.reported.clear();
  removeConvertedGeometries(segmentationCuts);
}

/**
 * Forgets a segmentation: its cuts leave every viewport and the surfaces that
 * were made for them leave the cache. The tools call it on
 * SEGMENTATION_REMOVED.
 *
 * @param segmentationId - The id of the segmentation.
 */
function removeContourCutsOfSegmentation(segmentationId: string): void {
  const segmentationCuts = cutsBySegmentation.get(segmentationId);

  cutsByViewport.forEach((viewportCuts, viewportId) => {
    if (viewportCuts.planeCuts.has(segmentationId)) {
      removeContourCuts(viewportId, segmentationId);
    }
  });

  if (!segmentationCuts) {
    return;
  }

  segmentationCuts.removed = true;
  segmentationCuts.planeCuts.forEach((planeCut) => {
    planeCut.viewportIds.clear();
    releasePlaneCut(segmentationId, planeCut, undefined);
  });
  removeConvertedGeometries(segmentationCuts);
  cutsBySegmentation.delete(segmentationId);
}

/**
 * Takes the surfaces that the cuts made from the contours out of the cache,
 * as the cache keeps a geometry under its id and would give the old surface
 * to the next conversion. A surface of the Surface representation stays.
 */
function removeConvertedGeometries(segmentationCuts: SegmentationCuts): void {
  segmentationCuts.convertedGeometryIds.forEach((geometryId) =>
    removeConvertedGeometry(segmentationCuts.segmentationId, geometryId)
  );
  segmentationCuts.convertedGeometryIds.clear();
}

function removeConvertedGeometry(
  segmentationId: string,
  geometryId: string | undefined
): void {
  const represented =
    getSegmentation(
      segmentationId
    )?.representationData.Surface?.geometryIds?.values();

  if (
    geometryId &&
    cache.getGeometry(geometryId) &&
    !new Set(represented ?? []).has(geometryId)
  ) {
    cache.removeGeometryLoadObject(geometryId);
  }
}

export {
  updateContourCuts,
  getViewportContourCutsState,
  removeContourCuts,
  removeContourCutsOfViewport,
  removeContourCutsOfSegmentation,
  updateContourCutsOfModifiedSegmentation,
};
