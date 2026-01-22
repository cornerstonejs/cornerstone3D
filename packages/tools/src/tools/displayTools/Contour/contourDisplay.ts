import type { StackViewport, Types } from '@cornerstonejs/core';
import {
  cache,
  getEnabledElementByViewportId,
  Enums,
  utilities,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import type { ContourRepresentation } from '../../../types/SegmentationStateTypes';
import removeContourFromElement from './removeContourFromElement';
import { getPolySeg } from '../../../config';
import { computeAndAddRepresentation } from '../../../utilities/segmentation/computeAndAddRepresentation';
import { getUniqueSegmentIndices } from '../../../utilities/segmentation/getUniqueSegmentIndices';
import { getAnnotation } from '../../../stateManagement/annotation/annotationState';
import { vec3 } from 'gl-matrix';

const polySegConversionInProgressForViewportId = new Map<string, boolean>();

const processedViewportSegmentations = new Map<string, Set<string>>();

/**
 * It removes a segmentation representation from the tool group's viewports and
 * from the segmentation state
 * @param viewportId - The id of the viewport
 * @param segmentationId - The id of the segmentation
 * @param renderImmediate - If true, the viewport will be rendered immediately after the segmentation representation is removed
 */
function removeRepresentation(
  viewportId: string,
  segmentationId: string,
  renderImmediate = false
): void {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;

  if (!renderImmediate) {
    return;
  }

  viewport.render();
}

/**
 * It renders the contour sets for the given segmentation
 * @param viewport - The viewport object
 * @param representation - SegmentationRepresentation
 * @param toolGroupConfig - This is the configuration object for the tool group
 */
async function render(
  viewport: StackViewport | Types.IVolumeViewport,
  contourRepresentation: ContourRepresentation
): Promise<void> {
  const { segmentationId } = contourRepresentation;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return;
  }

  let contourData = segmentation.representationData[Representations.Contour];
  const polySeg = getPolySeg();

  if (
    !contourData &&
    getPolySeg()?.canComputeRequestedRepresentation(
      segmentationId,
      Representations.Contour
    ) &&
    !polySegConversionInProgressForViewportId.get(viewport.id)
  ) {
    polySegConversionInProgressForViewportId.set(viewport.id, true);

    try {
      contourData = await computeAndAddRepresentation(
        segmentationId,
        Representations.Contour,
        () => polySeg.computeContourData(segmentationId, { viewport })
      );
    } catch (error) {
      console.warn(
        'Unable to compute contour data for segmentationId',
        segmentationId,
        error
      );
    }

    polySegConversionInProgressForViewportId.set(viewport.id, false);
  } else if (!contourData && !getPolySeg()) {
    console.debug(
      `No contour data found for segmentationId ${segmentationId} and PolySeg add-on is not configured. Unable to convert from other representations to contour. Please register PolySeg using cornerstoneTools.init({ addons: { polySeg } }) to enable automatic conversion.`
    );
  }

  if (!contourData) {
    return;
  }

  if (!contourData.geometryIds?.length) {
    return;
  }

  // here we need to check if the contour data matches the viewport really.
  let hasContourDataButNotMatchingViewport = false;
  const viewportNormal = viewport.getCamera().viewPlaneNormal;

  if (contourData.annotationUIDsMap) {
    hasContourDataButNotMatchingViewport = !_checkContourNormalsMatchViewport(
      contourData.annotationUIDsMap,
      viewportNormal
    );
  }

  if (contourData.geometryIds.length > 0) {
    hasContourDataButNotMatchingViewport = !_checkContourGeometryMatchViewport(
      contourData.geometryIds,
      viewportNormal
    );
  }

  // Get or create the set of processed segmentations for this viewport
  const viewportProcessed =
    processedViewportSegmentations.get(viewport.id) || new Set();

  // Modify the condition to include viewport-segmentation check
  if (
    hasContourDataButNotMatchingViewport &&
    !polySegConversionInProgressForViewportId.get(viewport.id) &&
    !viewportProcessed.has(segmentationId) &&
    viewport.viewportStatus === Enums.ViewportStatus.RENDERED
  ) {
    polySegConversionInProgressForViewportId.set(viewport.id, true);
    const segmentIndices = getUniqueSegmentIndices(segmentationId);

    // for (const segmentIndex of segmentIndices) {
    const surfacesInfo = await polySeg.computeSurfaceData(segmentationId, {
      segmentIndices,
      viewport,
    });

    const geometryIds = surfacesInfo.geometryIds;

    const pointsAndPolys = [];
    // loop into the map for geometryIds and get the geometry
    for (const geometryId of geometryIds.values()) {
      const geometry = cache.getGeometry(geometryId);
      const data = geometry.data as Types.ISurface;
      pointsAndPolys.push({
        points: data.points,
        polys: data.polys,
        segmentIndex: data.segmentIndex,
        id: data.segmentIndex,
      });
    }

    const polyDataCache = await polySeg.clipAndCacheSurfacesForViewport(
      pointsAndPolys,
      viewport as Types.IVolumeViewport
    );

    const rawResults = polySeg.extractContourData(polyDataCache);

    const annotationUIDsMap =
      polySeg.createAndAddContourSegmentationsFromClippedSurfaces(
        rawResults,
        viewport,
        segmentationId
      );

    contourData.annotationUIDsMap = new Map([
      ...contourData.annotationUIDsMap,
      ...annotationUIDsMap,
    ]);

    // Add the segmentation to the viewport's processed set
    viewportProcessed.add(segmentationId);
    processedViewportSegmentations.set(viewport.id, viewportProcessed);
    polySegConversionInProgressForViewportId.set(viewport.id, false);
  }

  handleContourSegmentation(
    viewport,
    contourData.geometryIds,
    contourData.annotationUIDsMap,
    contourRepresentation
  );
}

function _checkContourGeometryMatchViewport(
  geometryIds: string[],
  viewportNormal: Types.Point3
): boolean {
  // Find a geometry with at least 3 points in its first contour
  let validGeometry = null;
  let geometryData = null;

  for (const geometryId of geometryIds) {
    const geometry = cache.getGeometry(geometryId);

    if (!geometry) {
      continue;
    }

    const data = geometry.data as Types.IContourSet;

    if (data.contours?.[0]?.points?.length >= 3) {
      validGeometry = geometry;
      geometryData = data;
      break;
    }
  }

  if (!validGeometry || !geometryData) {
    return false;
  }

  const contours = geometryData.contours;
  const { points } = contours[0];
  const [point] = points;
  const delta = vec3.create();
  const { length } = points;
  const increment = Math.ceil(length / 25);
  for (let i = 1; i < length; i += increment) {
    const point2 = points[i];
    vec3.sub(delta, point, point2);
    vec3.normalize(delta, delta);
    if (vec3.dot(viewportNormal, delta) > 0.1) {
      return false;
    }
  }
  return true;
}

function _checkContourNormalsMatchViewport(
  annotationUIDsMap: Map<number, Set<string>>,
  viewportNormal: Types.Point3
): boolean {
  const annotationUIDs = Array.from(annotationUIDsMap.values())
    .flat()
    .map((uidSet) => Array.from(uidSet))
    .flat();

  // Use getRandomSampleFromArray to get up to 3 random annotations
  const randomAnnotationUIDs = utilities.getRandomSampleFromArray(
    annotationUIDs,
    3
  );

  for (const annotationUID of randomAnnotationUIDs) {
    const annotation = getAnnotation(annotationUID);
    if (annotation?.metadata) {
      // If viewPlaneNormal is not defined (e.g., in SR annotations),
      // we'll consider it a match to avoid throwing errors
      if (!annotation.metadata.viewPlaneNormal) {
        continue;
      }

      const annotationNormal = annotation.metadata.viewPlaneNormal;
      // Check if normals are parallel or anti-parallel (dot product close to 1 or -1)
      const dotProduct = Math.abs(
        viewportNormal[0] * annotationNormal[0] +
          viewportNormal[1] * annotationNormal[1] +
          viewportNormal[2] * annotationNormal[2]
      );

      if (Math.abs(dotProduct - 1) > 0.01) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Default function to call when segmentation representation is updated
 *
 * @param viewport
 * @returns
 */
function getUpdateFunction(
  viewport: Types.IVolumeViewport | Types.IStackViewport
): (segmentationId: string) => Promise<void> {
  return null;
}

export default {
  getUpdateFunction,
  render,
  removeRepresentation,
};
