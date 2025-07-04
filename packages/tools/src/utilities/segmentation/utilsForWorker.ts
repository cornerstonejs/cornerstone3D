import {
  cache,
  utilities,
  eventTarget,
  Enums,
  triggerEvent,
  metaData,
} from '@cornerstonejs/core';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { getStrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';
import ensureSegmentationVolume from '../../tools/segmentation/strategies/compositions/ensureSegmentationVolume';
import ensureImageVolume from '../../tools/segmentation/strategies/compositions/ensureImageVolume';
import { getPrimaryVolumeId } from '../../types/LabelmapTypes';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { splitImageIdsArray } from '../../stateManagement/segmentation/utilities/splitImageIdsArray';

/**
 * Trigger worker progress event
 * @param workerType - The worker type
 * @param progress - The progress value (0-100)
 */
export const triggerWorkerProgress = (workerType, progress) => {
  triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
    progress,
    type: workerType,
  });
};

/**
 * Get segmentation data for processing
 * @param segmentationId - The segmentation ID
 * @param segmentIndices - The segment indices to process
 * @returns Object containing segmentation data and operation data
 */
export const getSegmentationDataForWorker = (
  segmentationId,
  segmentIndices
) => {
  const segmentation = getSegmentation(segmentationId);
  const { representationData } = segmentation;

  const { Labelmap } = representationData;

  if (!Labelmap) {
    console.debug('No labelmap found for segmentation', segmentationId);
    return null;
  }

  //TODO: Handle multi-volume segmentations if needed
  // For now, we get only the first segmentation volume
  const segVolumeId = getPrimaryVolumeId(
    Labelmap as LabelmapSegmentationDataVolume
  );
  let segImageIds = null;
  if (segVolumeId) {
    const segmentationVolume = cache.getVolume(segVolumeId);
    if (!segmentationVolume) {
      console.debug('No segmentation volume found for ID', segVolumeId);
      return null;
    }
    segImageIds = segmentationVolume.imageIds;
  } else {
    const { imageIds } = Labelmap as LabelmapSegmentationDataStack;

    const segImageIdsArray = splitImageIdsArray(imageIds);
    if (!segImageIdsArray || segImageIdsArray.length === 0) {
      console.debug('No imageIds found for segmentation', segmentationId);
      return null;
    }
    segImageIds = segImageIdsArray[0]; // Use the first imageIds array for processing
  }

  // Create a minimal operationData object
  const operationData = {
    segmentationId,
    volumeId: segVolumeId,
    imageIds: segImageIds,
  };

  let reconstructableVolume = false;
  if (segImageIds) {
    const refImageIds = segImageIds.map((imageId) => {
      const image = cache.getImage(imageId);
      return image.referencedImageId;
    });
    reconstructableVolume = utilities.isValidVolume(refImageIds);
  }

  let indices = segmentIndices;

  if (!indices) {
    indices = [getActiveSegmentIndex(segmentationId)];
  } else if (!Array.isArray(indices)) {
    // Include the preview index
    indices = [indices, 255];
  }

  return {
    operationData,
    segVolumeId,
    segImageIds,
    reconstructableVolume,
    indices,
  };
};

/**
 * Prepare strategy data for volume operations
 * @param operationData - The operation data
 * @returns The strategy data
 */
export const prepareVolumeStrategyDataForWorker = (operationData) => {
  return getStrategyData({
    operationData,
    strategy: {
      ensureSegmentationVolumeFor3DManipulation:
        ensureSegmentationVolume.ensureSegmentationVolumeFor3DManipulation,
      ensureImageVolumeFor3DManipulation:
        ensureImageVolume.ensureImageVolumeFor3DManipulation,
    },
  });
};

/**
 * Prepare image info for worker tasks
 * @param imageVoxelManager - The image voxel manager
 * @param imageData - The image data
 * @returns The image info
 */
export const prepareImageInfo = (imageVoxelManager, imageData) => {
  const imageScalarData = imageVoxelManager.getCompleteScalarDataArray();

  return {
    scalarData: imageScalarData,
    dimensions: imageData.getDimensions(),
    spacing: imageData.getSpacing(),
    origin: imageData.getOrigin(),
    direction: imageData.getDirection(),
  };
};

/**
 * Prepare stack data for worker tasks
 * @param segImageIds - The segmentation image IDs
 * @returns The segmentation and image info arrays
 */
export const prepareStackDataForWorker = (segImageIds) => {
  const segmentationInfo = [];
  const imageInfo = [];

  for (const segImageId of segImageIds) {
    const segImage = cache.getImage(segImageId);
    const segPixelData = segImage.getPixelData();

    const { origin, direction, spacing, dimensions } =
      utilities.getImageDataMetadata(segImage);

    segmentationInfo.push({
      scalarData: segPixelData,
      dimensions,
      spacing,
      origin,
      direction,
    });

    // Add image info if referenced image exists
    const refImageId = segImage.referencedImageId;
    if (refImageId) {
      const refImage = cache.getImage(refImageId);

      if (!refImage) {
        continue;
      }

      const refPixelData = refImage.getPixelData();

      const refVoxelManager = refImage.voxelManager;
      const refSpacing = [
        refImage.rowPixelSpacing,
        refImage.columnPixelSpacing,
      ];

      imageInfo.push({
        scalarData: refPixelData,
        dimensions: refVoxelManager
          ? refVoxelManager.dimensions
          : [refImage.columns, refImage.rows, 1],
        spacing: refSpacing,
      });
    }
  }

  return { segmentationInfo, imageInfo };
};

/**
 * Gets the reference image ID and modality unit options based on segmentation data
 * @param segVolumeId - The segmentation volume ID
 * @param segImageIds - The segmentation image IDs
 * @returns Object containing reference image ID and modality unit options
 */
export const getImageReferenceInfo = (segVolumeId, segImageIds) => {
  let refImageId;

  if (segVolumeId) {
    const segmentationVolume = cache.getVolume(segVolumeId);
    const imageIds = segmentationVolume.imageIds;

    const cachedImage = cache.getImage(imageIds[0]);

    if (cachedImage) {
      refImageId = cachedImage.referencedImageId;
    }
  } else if (segImageIds?.length) {
    const segImage = cache.getImage(segImageIds[0]);
    refImageId = segImage.referencedImageId;
  }

  const refImage = cache.getImage(refImageId);
  const scalingModule = metaData.get('scalingModule', refImageId);

  const modalityUnitOptions = {
    isPreScaled: Boolean(refImage?.preScale?.scaled),
    isSuvScaled: typeof scalingModule?.suvbw === 'number',
  };

  return { refImageId, modalityUnitOptions };
};
