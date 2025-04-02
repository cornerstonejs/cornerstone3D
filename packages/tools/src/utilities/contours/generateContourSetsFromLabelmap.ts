import {
  cache as cornerstoneCache,
  type Types,
  getWebWorkerManager,
  cache,
  utilities,
} from '@cornerstonejs/core';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import { WorkerTypes } from '../../enums';
import { registerComputeWorker } from '../registerComputeWorker';
import { triggerWorkerProgress } from '../segmentation/utilsForWorker';
import getOrCreateSegmentationVolume from '../segmentation/getOrCreateSegmentationVolume';
const { Labelmap } = SegmentationRepresentations;

async function generateContourSetsFromLabelmap({ segmentations }) {
  // Register worker if not already registered
  registerComputeWorker();

  // Trigger progress indicator
  triggerWorkerProgress(WorkerTypes.GENERATE_CONTOUR_SETS, 0);

  const {
    representationData,
    segments = [0, 1],
    segmentationId,
  } = segmentations;
  let { volumeId: segVolumeId } = representationData[Labelmap];

  if (!segVolumeId) {
    const segVolume = getOrCreateSegmentationVolume(segmentationId);
    if (segVolume) {
      segVolumeId = segVolume.volumeId;
    }
  }

  // Get segmentation volume
  const vol = cornerstoneCache.getVolume(segVolumeId);
  if (!vol) {
    console.warn(`No volume found for ${segVolumeId}`);
    return;
  }

  const voxelManager = vol.voxelManager as Types.IVoxelManager<number>;
  const segScalarData =
    voxelManager.getCompleteScalarDataArray() as Array<number>;

  // Prepare segmentation info for worker
  const segmentationInfo = {
    scalarData: segScalarData,
    dimensions: vol.dimensions,
    spacing: vol.imageData.getSpacing(),
    origin: vol.imageData.getOrigin(),
    direction: vol.imageData.getDirection(),
  };

  // Prepare indices from segments
  const indices = Array.isArray(segments)
    ? segments
        .filter((segment) => segment !== null)
        .map((segment) => segment.segmentIndex || segment)
    : Object.values(segments)
        .filter((segment) => segment !== null)
        // @ts-expect-error
        .map((segment) => segment.segmentIndex || segment);

  // Execute task in worker
  const contourSets = await getWebWorkerManager().executeTask(
    'compute',
    'generateContourSetsFromLabelmapVolume',
    {
      segmentation: segmentationInfo,
      indices,
      mode: 'individual',
    }
  );

  const refImages = vol.imageIds.map((imageId) => {
    const refImageId = cache.getImage(imageId)?.referencedImageId;
    return refImageId ? cache.getImage(refImageId) : undefined;
  });

  const refImageDataMetadata = refImages.map((image) => {
    return utilities.getImageDataMetadata(image);
  });

  // Post-process to match expected return format
  const processedContourSets = contourSets.map((contourSet, index) => {
    const segment = segments[contourSet.segment.segmentIndex] || {};

    if (!contourSet.sliceContours.length) {
      return null;
    }

    const p1 = contourSet.sliceContours[0].polyData.points[0];
    const p2 = contourSet.sliceContours[0].polyData.points[1];

    let refImageId;
    if (p1 && p2) {
      // find the closest image that these two points are on its plane
      const refImageIndex = refImageDataMetadata.findIndex(
        (imageDataMetadata) => {
          const { origin, direction } = imageDataMetadata;
          const rowCosineVec = direction.slice(0, 3);
          const colCosineVec = direction.slice(3, 6);
          const [x1, y1, z1] = p1;
          const [x2, y2, z2] = p2;

          const normalVec = [
            rowCosineVec[1] * colCosineVec[2] -
              rowCosineVec[2] * colCosineVec[1],
            rowCosineVec[2] * colCosineVec[0] -
              rowCosineVec[0] * colCosineVec[2],
            rowCosineVec[0] * colCosineVec[1] -
              rowCosineVec[1] * colCosineVec[0],
          ];

          // Normalize the normal vector
          const normalLength = Math.sqrt(
            normalVec[0] * normalVec[0] +
              normalVec[1] * normalVec[1] +
              normalVec[2] * normalVec[2]
          );
          const unitNormal = [
            normalVec[0] / normalLength,
            normalVec[1] / normalLength,
            normalVec[2] / normalLength,
          ];

          const originToP1 = [x1 - origin[0], y1 - origin[1], z1 - origin[2]];
          const originToP2 = [x2 - origin[0], y2 - origin[1], z2 - origin[2]];

          const distanceP1 = Math.abs(
            originToP1[0] * unitNormal[0] +
              originToP1[1] * unitNormal[1] +
              originToP1[2] * unitNormal[2]
          );

          const distanceP2 = Math.abs(
            originToP2[0] * unitNormal[0] +
              originToP2[1] * unitNormal[1] +
              originToP2[2] * unitNormal[2]
          );

          // Define a small threshold to account for floating-point precision
          const EPSILON = 0.001;

          // Return true if both points are close enough to the plane
          return distanceP1 < EPSILON && distanceP2 < EPSILON;
        }
      );

      if (refImageIndex !== -1) {
        refImageId = refImages[refImageIndex].imageId;
      }
    }

    return {
      label: segment.label,
      color: segment.color,
      metadata: {
        FrameOfReferenceUID: vol.metadata.FrameOfReferenceUID,
        referencedImageId: refImageId,
      },
      sliceContours: contourSet.sliceContours.map((contourData) => ({
        contours: contourData.contours,
        polyData: contourData.polyData,
        FrameNumber: contourData.sliceIndex + 1,
        sliceIndex: contourData.sliceIndex,
        FrameOfReferenceUID: vol.metadata.FrameOfReferenceUID,
        referencedImageId: refImageId,
      })),
    };
  });

  // Trigger completion
  triggerWorkerProgress(WorkerTypes.GENERATE_CONTOUR_SETS, 100);

  return processedContourSets;
}

export { generateContourSetsFromLabelmap };
