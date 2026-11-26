import {
  cache,
  utilities,
  eventTarget,
  Enums,
  triggerEvent,
  metaData,
  getEnabledElementByViewportId,
  type VideoViewport,
} from '@cornerstonejs/core';
import { getActiveSegmentIndex } from '../../stateManagement/segmentation/getActiveSegmentIndex';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { getViewportIdsWithSegmentation } from '../../stateManagement/segmentation/getViewportIdsWithSegmentation';
import { getCurrentLabelmapImageIdsForViewport } from '../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getStrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';
import type { StrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';
import ensureSegmentationVolume from '../../tools/segmentation/strategies/compositions/ensureSegmentationVolume';
import ensureImageVolume from '../../tools/segmentation/strategies/compositions/ensureImageVolume';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'utilities.segmentation.utilsForWorker'
);

/** The tolerance of a position, a direction and a spacing of one plane. */
const IMAGE_PLANE_TOLERANCE = 1e-3;

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
  if (!segmentation?.representationData) {
    cs3dLogger.debug(
      'getSegmentationDataForWorker: segmentation missing or not ready',
      segmentationId
    );
    return null;
  }

  const { representationData } = segmentation;

  const { Labelmap } = representationData;

  if (!Labelmap) {
    cs3dLogger.debug('No labelmap found for segmentation', segmentationId);
    return null;
  }

  const segVolumeId = (Labelmap as LabelmapSegmentationDataVolume).volumeId;
  const segImageIds = (Labelmap as LabelmapSegmentationDataStack).imageIds;

  // Create a minimal operationData object
  const operationData = {
    segmentationId,
    volumeId: segVolumeId,
    imageIds: segImageIds,
  };

  let reconstructableVolume = Boolean(segVolumeId);
  if (!reconstructableVolume && segImageIds) {
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
export const prepareVolumeStrategyDataForWorker = (
  operationData
): StrategyData | null => {
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
 * @param referencedImageIds - The image of each labelmap image, as
 * `getReferencedImageIdsOfLabelmap` gives them; without it, the
 * `referencedImageId` of each labelmap image
 * @returns The segmentation and image info arrays
 */
export const prepareStackDataForWorker = (
  segImageIds: string[],
  referencedImageIds?: string[]
) => {
  const segmentationInfo = [];
  const imageInfo = [];

  for (const [index, segImageId] of segImageIds.entries()) {
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
    const refImageId =
      referencedImageIds?.[index] ?? segImage.referencedImageId;
    if (refImageId) {
      const refImage = cache.getImage(refImageId);

      if (!refImage) {
        throw new Error(
          `getStatistics: the image ${refImageId} of the labelmap image ${segImageId} is not in the cache. The frames of a video never are: the statistics of a labelmap over a video need a video viewport that shows the segmentation.`
        );
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
 * The video viewport that shows a segmentation, the first of them when more
 * do, or undefined. The statistics of a labelmap over a video read the frame
 * on display of this viewport.
 */
export const getVideoViewportOfSegmentation = (
  segmentationId: string
): VideoViewport | undefined => {
  for (const viewportId of getViewportIdsWithSegmentation(segmentationId)) {
    const viewport = getEnabledElementByViewportId(viewportId)?.viewport;

    if (viewport?.type === Enums.ViewportType.VIDEO) {
      return viewport as VideoViewport;
    }
  }
};

/**
 * The data of the worker of the stack statistics for the frame on display of
 * a video viewport: the labelmap image of that frame, of the labelmap images
 * of the segmentation (as a stack reads its labelmap images), each paired
 * with the RGBA pixels of the frame, which the worker reads as red, green and
 * blue.
 *
 * @throws When the frame has no labelmap image, or the frame and its labelmap
 * image differ in size.
 */
export const prepareVideoFrameDataForWorker = (
  segmentationId: string,
  viewport: VideoViewport,
  segImageIds: string[]
) => {
  const frameNumber = viewport.getFrameNumber();
  const segImageIdSet = new Set(segImageIds);
  const frameSegImageIds = (
    getCurrentLabelmapImageIdsForViewport(viewport.id, segmentationId) ?? []
  ).filter((imageId) => segImageIdSet.has(imageId));
  if (!frameSegImageIds.length) {
    throw new Error(
      `getStatistics: frame ${frameNumber} of the video viewport ${viewport.id} has no labelmap image of the segmentation ${segmentationId}.`
    );
  }

  const frame = viewport.getImageData();
  const segmentationInfo = [];
  const imageInfo = [];

  for (const segImageId of frameSegImageIds) {
    const segImage = cache.getImage(segImageId);
    const { origin, direction, spacing, dimensions } =
      utilities.getImageDataMetadata(segImage);
    const frameScalarData = frame?.scalarData;

    if (
      !frameScalarData?.length ||
      frameScalarData.length !== dimensions[0] * dimensions[1] * 4
    ) {
      throw new Error(
        `getStatistics: frame ${frameNumber} of the video viewport ${viewport.id} has ${
          frameScalarData?.length ?? 0
        } RGBA values, and its labelmap image ${segImageId} is ${dimensions[0]} by ${dimensions[1]} pixels.`
      );
    }

    segmentationInfo.push({
      scalarData: segImage.getPixelData(),
      dimensions,
      spacing,
      origin,
      direction,
    });
    imageInfo.push({
      scalarData: frameScalarData,
      dimensions,
      spacing: [spacing[0], spacing[1]],
    });
  }

  return { segmentationInfo, imageInfo, frameNumber };
};

/**
 * Gets the reference image ID and modality unit options based on segmentation data
 * @param segVolumeId - The segmentation volume ID
 * @param segImageIds - The segmentation image IDs
 * @param referencedImageIds - The image of each labelmap image of a stack, as
 * `getReferencedImageIdsOfLabelmap` gives them
 * @returns Object containing reference image ID and modality unit options
 */
export const getImageReferenceInfo = (
  segVolumeId,
  segImageIds,
  referencedImageIds?: string[]
) => {
  let refImageId = referencedImageIds?.[0];

  if (refImageId) {
    return getModalityUnitInfo(refImageId);
  }

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

  return getModalityUnitInfo(refImageId);
};

/** The image id and the options of the unit of the values of an image. */
function getModalityUnitInfo(refImageId: string) {
  const refImage = refImageId ? cache.getImage(refImageId) : undefined;
  const scalingModule = metaData.get('scalingModule', refImageId);

  const modalityUnitOptions = {
    isPreScaled: Boolean(refImage?.preScale?.scaled),
    isSuvScaled: typeof scalingModule?.suvbw === 'number',
  };

  return { refImageId, modalityUnitOptions };
}

/** Whether two images lie on one plane with one pixel grid. */
function isSameImagePlane(segImage, image): boolean {
  if (!image) {
    return false;
  }

  const a = utilities.getImageDataMetadata(segImage);
  const b = utilities.getImageDataMetadata(image);

  return (
    a.dimensions[0] === b.dimensions[0] &&
    a.dimensions[1] === b.dimensions[1] &&
    utilities.isEqual(a.origin, b.origin, IMAGE_PLANE_TOLERANCE) &&
    utilities.isEqual(a.direction, b.direction, IMAGE_PLANE_TOLERANCE) &&
    utilities.isEqual(a.spacing, b.spacing, IMAGE_PLANE_TOLERANCE)
  );
}

/**
 * The image that each labelmap image of a stack segmentation is drawn on:
 * its `referencedImageId`, else the image of the cache that lies on its
 * plane with its pixel grid, of the images of the viewports that show the
 * segmentation. An application that makes the labelmap images with
 * `createAndCacheLocalImage` from the geometry alone gives no
 * `referencedImageId`.
 *
 * @throws When a labelmap image references no image and no such image lies
 * on its plane.
 */
export const getReferencedImageIdsOfLabelmap = (
  segmentationId: string,
  segImageIds: string[]
): string[] => {
  let candidates: string[] | undefined;
  const getCandidates = () => {
    candidates ??= getViewportIdsWithSegmentation(segmentationId).flatMap(
      (viewportId) => {
        const viewport = getEnabledElementByViewportId(viewportId)?.viewport as
          | { getImageIds?: () => string[] }
          | undefined;

        return viewport?.getImageIds?.() ?? [];
      }
    );

    return candidates;
  };

  return segImageIds.map((segImageId) => {
    const segImage = cache.getImage(segImageId);

    if (segImage?.referencedImageId) {
      return segImage.referencedImageId;
    }

    const imageId = getCandidates().find((candidate) =>
      isSameImagePlane(segImage, cache.getImage(candidate))
    );

    if (!imageId) {
      throw new Error(
        `getStatistics: the labelmap image ${segImageId} references no image, and no image of the viewports that show the segmentation ${segmentationId} is in the cache on its plane with its size. Give the labelmap images a referencedImageId, or show the segmentation over the images that it was drawn on.`
      );
    }

    return imageId;
  });
};
