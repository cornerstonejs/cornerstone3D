import type { StackViewport, Types } from '@cornerstonejs/core';
import { getEnabledElementByViewportId } from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import { handleContourSegmentation } from './contourHandler/handleContourSegmentation';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import type { ContourRepresentation } from '../../../types/SegmentationStateTypes';
import removeContourFromElement from './removeContourFromElement';
import { getAddOns, getPolySeg } from '../../../config';
import { computeAndAddRepresentation } from '../../../utilities/segmentation/computeAndAddRepresentation';

let polySegConversionInProgress = false;

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

  // Remove the segmentation from the viewport's processed set
  // const viewportProcessed = processedViewportSegmentations.get(viewportId);
  // if (viewportProcessed) {
  //   viewportProcessed.delete(segmentationId);
  //   if (viewportProcessed.size === 0) {
  //     processedViewportSegmentations.delete(viewportId);
  //   }
  // }

  if (!renderImmediate) {
    return;
  }

  removeContourFromElement(viewportId, segmentationId);

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

  if (
    !contourData &&
    getPolySeg()?.canComputeRequestedRepresentation(
      segmentationId,
      Representations.Contour
    ) &&
    !polySegConversionInProgress
  ) {
    polySegConversionInProgress = true;

    const polySeg = getPolySeg();

    contourData = await computeAndAddRepresentation(
      segmentationId,
      Representations.Contour,
      () => polySeg.computeContourData(segmentationId, { viewport }),
      () => undefined
    );

    polySegConversionInProgress = false;
  }

  if (!contourData) {
    return;
  }

  if (!contourData.geometryIds?.length) {
    return;
  }

  // here we need to check if the contour data matches the viewport really.
  // let hasContourDataButNotMatchingViewport = false;

  // if (contourData.annotationUIDsMap) {
  //   const viewportNormal = viewport.getCamera().viewPlaneNormal;
  //   hasContourDataButNotMatchingViewport = !_checkContourNormalsMatchViewport(
  //     contourData.annotationUIDsMap,
  //     viewportNormal
  //   );
  // }

  // // Get or create the set of processed segmentations for this viewport
  // const viewportProcessed =
  //   processedViewportSegmentations.get(viewport.id) || new Set();

  // // Modify the condition to include viewport-segmentation check
  // if (
  //   hasContourDataButNotMatchingViewport &&
  //   !polySegConversionInProgress &&
  //   !viewportProcessed.has(segmentationId)
  // ) {
  //   polySegConversionInProgress = true;
  //   const segmentIndices = getUniqueSegmentIndices(segmentationId);

  //   registerPolySegWorker();
  //   const pointsAndPolys = [];

  //   for (const segmentIndex of segmentIndices) {
  //     const surfacesInfo = await convertContourToSurface(
  //       contourData,
  //       segmentIndex
  //     );

  //     pointsAndPolys.push({
  //       points: surfacesInfo.points,
  //       polys: surfacesInfo.polys,
  //       segmentIndex,
  //       id: segmentIndex.toString(),
  //     });
  //   }

  //   const polyDataCache = await clipAndCacheSurfacesForViewport(
  //     pointsAndPolys,
  //     viewport as Types.IVolumeViewport
  //   );

  //   const rawResults = extractContourData(polyDataCache);

  //   const annotationUIDsMap =
  //     createAndAddContourSegmentationsFromClippedSurfaces(
  //       rawResults,
  //       viewport,
  //       segmentationId
  //     );

  //   polySegConversionInProgress = false;
  //   // grab the contour data from the clipped surfaces of the contours

  //   // merge with previous annotationUIDsMap
  //   contourData.annotationUIDsMap = new Map([
  //     ...contourData.annotationUIDsMap,
  //     ...annotationUIDsMap,
  //   ]);

  //   // Add the segmentation to the viewport's processed set
  //   viewportProcessed.add(segmentationId);
  //   processedViewportSegmentations.set(viewport.id, viewportProcessed);
  // }

  handleContourSegmentation(
    viewport,
    contourData.geometryIds,
    contourData.annotationUIDsMap,
    contourRepresentation
  );
}

// function _checkContourNormalsMatchViewport(
//   annotationUIDsMap: Map<number, Set<string>>,
//   viewportNormal: Types.Point3
// ): boolean {
//   const annotationUIDs = Array.from(annotationUIDsMap.values())
//     .flat()
//     .map((uidSet) => Array.from(uidSet))
//     .flat();

//   // Take up to 3 random annotations to check
//   const sampleSize = Math.min(3, annotationUIDs.length);
//   const randomAnnotationUIDs = [];
//   for (let i = 0; i < sampleSize; i++) {
//     const randomIndex = Math.floor(Math.random() * annotationUIDs.length);
//     randomAnnotationUIDs.push(annotationUIDs[randomIndex]);
//   }

//   for (const annotationUID of randomAnnotationUIDs) {
//     const annotation = getAnnotation(annotationUID);
//     if (annotation?.metadata?.viewPlaneNormal) {
//       const annotationNormal = annotation.metadata.viewPlaneNormal;
//       // Check if normals are parallel or anti-parallel (dot product close to 1 or -1)
//       const dotProduct = Math.abs(
//         viewportNormal[0] * annotationNormal[0] +
//           viewportNormal[1] * annotationNormal[1] +
//           viewportNormal[2] * annotationNormal[2]
//       );

//       if (Math.abs(dotProduct - 1) > 0.01) {
//         return false;
//       }
//     }
//   }

//   return true;
// }

export default {
  render,
  removeRepresentation,
};
