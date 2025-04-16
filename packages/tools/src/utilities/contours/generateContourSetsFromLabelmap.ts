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
  const processedContourSets = contourSets
    .map((contourSet) => {
      const segment = segments[contourSet.segment.segmentIndex] || {};

      if (!contourSet.sliceContours.length) {
        return null;
      }

      const p1 = contourSet.sliceContours[0].polyData.points[0] as Types.Point3;

      let refImageId;
      if (p1) {
        // find the closest image that these two points are on its plane
        const refImageIndex = refImageDataMetadata.findIndex(
          (imageDataMetadata) => {
            const { scanAxisNormal, origin } = imageDataMetadata;
            const plane = utilities.planar.planeEquation(
              scanAxisNormal,
              origin
            );
            return utilities.planar.isPointOnPlane(p1, plane);
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
    })
    .filter((contourSet) => contourSet !== null);

  // Trigger completion
  triggerWorkerProgress(WorkerTypes.GENERATE_CONTOUR_SETS, 100);

  return processedContourSets;
}

export { generateContourSetsFromLabelmap };
