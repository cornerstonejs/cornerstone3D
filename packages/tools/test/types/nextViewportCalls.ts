/**
 * The calls of the tools that an application writes with a next viewport, as
 * the 6.0 migration guide gives them. This file is compiled and never run:
 * the test `nextViewportTypes.jest.js` runs the compiler on it and expects no
 * error.
 *
 * It holds no cast. A call that needs one here needs one in an application.
 */
import type {
  ECGViewport,
  VolumeViewport3D,
  PlanarViewport,
  Types,
  VideoViewport,
  WSIViewport,
} from '@cornerstonejs/core';
import { segmentation, utilities } from '../../src';
import type { Types as ToolTypes } from '../../src';

declare const planar: PlanarViewport;
declare const volume3D: VolumeViewport3D;
declare const video: VideoViewport;
declare const wholeSlide: WSIViewport;
declare const ecg: ECGViewport;
declare const generic: Types.IViewport;
declare const enabledElement: Types.IEnabledElement;
declare const point: Types.Point3;

/** The functions of the tools that the guide calls with a next viewport. */
export function functionsOfTheGuide() {
  utilities.jumpToFocalPoint(planar, point);
  utilities.jumpToFocalPoint(generic, point);
  utilities.jumpToFocalPoint(enabledElement.viewport, point);

  return [
    utilities.navigatePlanarViewportToPoint(planar, point),
    utilities.navigatePlanarViewportToPoint(generic, point),
    utilities.navigatePlanarViewportToPoint(enabledElement.viewport, point),
    utilities.spatial.getDisplayedCanvasSize(planar),
    utilities.spatial.getDisplayedCanvasSize(volume3D),
    utilities.spatial.getDisplayedCanvasSize(video),
    utilities.spatial.getDisplayedCanvasSize(wholeSlide),
    utilities.spatial.getDisplayedCanvasSize(ecg),
    utilities.spatial.getDisplayedCanvasSize(generic),
    utilities.spatial.getDisplayedCanvasSize(enabledElement.viewport),
  ];
}

declare const annotation: ToolTypes.Annotation;
declare const annotations: ToolTypes.Annotations;
declare const boundsIJK: Types.BoundsIJK;
declare const polylineWorld: Types.Point3[];
declare const polylineCanvas: Types.Point2[];
declare const targetId: string;
declare const volumeId: string;

/** The other functions of the tools that work on a next viewport. */
export function functionsWithANextPath() {
  return [
    utilities.getViewSlabDepthOfViewport(planar),
    utilities.getViewSlabDepthOfViewport(generic),
    utilities.normalizeViewportPlane(planar, boundsIJK),
    utilities.annotationHydration(planar, 'Length', polylineWorld),
    utilities.annotationHydration(generic, 'Length', polylineWorld),
    utilities.getSlabIntensityPickContext(planar),
    utilities.pickIntensityPointInSlab(planar, point),
    utilities.pickIntensityPointInSlab(generic, point),
    utilities.spatial.getViewportPlane(planar),
    utilities.spatial.getViewportPlane(volume3D),
    utilities.spatial.areViewportsSpatiallyLinked(planar, generic, {
      policy: 'frameOfReferenceUID',
    }),
    utilities.spatial.clipWorldLineToViewportCanvas(
      { point, direction: [0, 0, 1] },
      planar
    ),
    utilities.spatial.translateViewportAlongNormal(planar, 1),
    utilities.viewport.isViewportPreScaled(planar, targetId),
    utilities.viewport.isViewportPreScaled(generic, targetId),
    utilities.voi.windowLevel.extractWindowLevelRegionToolData(planar),
    utilities.planar.filterAnnotationsForDisplay(planar, annotations),
    utilities.planar.filterAnnotationsForDisplay(generic, annotations),
    utilities.contours.getContourHolesDataCanvas(annotation, planar),
    utilities.contourSegmentation.convertContourPolylineToCanvasSpace(
      polylineWorld,
      planar
    ),
    utilities.contourSegmentation.convertContourPolylineToWorld(
      polylineCanvas,
      generic
    ),
  ];
}

/**
 * The functions that read members of the planar family. They take the class
 * of the planar viewport.
 */
export function functionsOfThePlanarFamily() {
  return [
    utilities.getClosestImageIdForStackViewport(planar, point, [0, 0, 1]),
    utilities.math.polyline.getSubPixelSpacingAndXYDirections(planar, 1),
    utilities.planar.getPointsInLineOfSight(planar, point, {
      targetVolumeId: volumeId,
      stepSize: 0.25,
    }),
    utilities.planar.getPointInLineOfSightWithCriteria(
      planar,
      point,
      volumeId,
      (_intensity, linePoint) => linePoint
    ),
  ];
}

declare const segmentationId: string;

/**
 * The calls of the segmentation state that an application makes around a
 * labelmap. `getLabelmapImageIds` gives the labelmap image ids, an array.
 */
export function segmentationStateCalls(): string[] {
  const labelmapImageIds: string[] | undefined =
    segmentation.getLabelmapImageIds(segmentationId);

  return labelmapImageIds?.filter((imageId) => imageId.length) ?? [];
}
