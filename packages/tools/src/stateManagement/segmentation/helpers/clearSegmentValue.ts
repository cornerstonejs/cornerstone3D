import { cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { triggerSegmentationDataModified } from '../triggerSegmentationEvents';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';

/**
 * Results of clearing segment values
 */
interface ClearSegmentResult {
  voxelsCleared: number;
  itemsProcessed: number;
}

/**
 * Validates the inputs for the clearSegmentValue function
 */
function validateInputs(segmentationId: string, segmentIndex: number): void {
  if (!segmentationId || typeof segmentationId !== 'string') {
    throw new Error('Valid segmentation ID is required');
  }

  if (typeof segmentIndex !== 'number' || segmentIndex <= 0) {
    throw new Error('Valid segment index (> 0) is required');
  }
}

/**
 * Retrieves and validates segmentation data
 */
function getValidatedSegmentationData(segmentationId: string) {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    throw new Error(`Segmentation not found: ${segmentationId}`);
  }

  if (!segmentation.representationData) {
    throw new Error(
      `No representation data found for segmentation: ${segmentationId}`
    );
  }

  if (!segmentation.representationData.Labelmap) {
    throw new Error(
      'Invalid segmentation type, only labelmap is supported right now'
    );
  }

  const labelmapData = segmentation.representationData.Labelmap;
  if (!labelmapData) {
    throw new Error(
      `No labelmap data found for segmentation: ${segmentationId}`
    );
  }

  return labelmapData;
}

/**
 * Gets items from cache for stack segmentation
 */
function getStackItems(
  imageIds: string[],
  segmentationId: string
): Array<Types.IImage> {
  if (!imageIds || imageIds.length === 0) {
    console.warn(`No imageIds found for segmentation: ${segmentationId}`);
    return [];
  }

  return imageIds
    .map((imageId: string) => {
      const image = cache.getImage(imageId);
      if (!image) {
        console.warn(`Image not found in cache: ${imageId}`);
        return null;
      }
      return image;
    })
    .filter((image): image is Types.IImage => image !== null);
}

/**
 * Gets items from cache for volume segmentation
 */
function getVolumeItems(
  volumeIds: string[],
  segmentationId: string
): Array<Types.IImageVolume> {
  if (volumeIds.length === 0) {
    console.warn(`No volumeIds found for segmentation: ${segmentationId}`);
    return [];
  }

  return volumeIds
    .map((volumeId: string) => {
      const volume = cache.getVolume(volumeId);
      if (!volume) {
        console.warn(`Volume not found in cache: ${volumeId}`);
        return null;
      }
      return volume;
    })
    .filter((volume): volume is Types.IImageVolume => volume !== null);
}

/**
 * Clears segment values from a single item (image or volume)
 */
function clearSegmentFromItem(
  item: Types.IImageVolume | Types.IImage,
  segmentIndex: number,
  itemIndex: number,
  segmentationId: string
): number {
  if (!item) {
    return 0;
  }

  const { voxelManager } = item;
  if (!voxelManager) {
    console.warn(
      `No voxel manager found for item ${itemIndex} in segmentation: ${segmentationId}`
    );
    return 0;
  }

  let voxelsCleared = 0;
  voxelManager.forEach(({ value, index }) => {
    if (value === segmentIndex) {
      voxelManager.setAtIndex(index, 0);
      voxelsCleared++;
    }
  });

  return voxelsCleared;
}

/**
 * Processes all items (images or volumes) to clear segment values
 */
function processItems(
  items: Array<Types.IImageVolume | Types.IImage>,
  segmentIndex: number,
  segmentationId: string
): ClearSegmentResult {
  let totalVoxelsCleared = 0;
  let itemsProcessed = 0;

  items.forEach(
    (item: Types.IImageVolume | Types.IImage, itemIndex: number) => {
      try {
        const voxelsCleared = clearSegmentFromItem(
          item,
          segmentIndex,
          itemIndex,
          segmentationId
        );

        if (voxelsCleared > 0) {
          totalVoxelsCleared += voxelsCleared;
          itemsProcessed++;
          console.debug(
            `Cleared ${voxelsCleared} voxels for segment ${segmentIndex} in item ${itemIndex}`
          );
        }
      } catch (itemError) {
        console.error(
          `Failed to process item ${itemIndex} for segmentation ${segmentationId}:`,
          itemError
        );
      }
    }
  );

  return { voxelsCleared: totalVoxelsCleared, itemsProcessed };
}

/**
 * Clears the specified segment value from a segmentation.
 *
 * @param segmentationId - The unique identifier of the segmentation.
 * @param segmentIndex - The index of the segment to be cleared (must be > 0).
 *
 * @throws {Error} If the segmentation type is not supported (currently only labelmap is supported).
 * @throws {Error} If input parameters are invalid.
 * @throws {Error} If segmentation is not found or has invalid data.
 *
 * @remarks
 * This function iterates through all voxels in the segmentation and sets the value to 0
 * for any voxel that matches the specified segment index. It supports both stack and volume
 * segmentations.
 */
export function clearSegmentValue(
  segmentationId: string,
  segmentIndex: number
) {
  try {
    // Input validation
    validateInputs(segmentationId, segmentIndex);

    // Get and validate segmentation data
    const labelmapData = getValidatedSegmentationData(segmentationId);

    // Process volume or stack data
    if ('imageIds' in labelmapData || 'volumeIds' in labelmapData) {
      const volumeIds =
        (labelmapData as LabelmapSegmentationDataVolume).volumeIds || [];

      let items: Array<Types.IImageVolume | Types.IImage> = [];

      if ('imageIds' in labelmapData) {
        // Stack segmentation
        items = getStackItems(labelmapData.imageIds || [], segmentationId);
      } else if (volumeIds.length > 0) {
        // Volume segmentation
        items = getVolumeItems(volumeIds, segmentationId);
      } else {
        console.warn(
          `No valid imageIds or volumeIds found for segmentation: ${segmentationId}`
        );
        return;
      }

      if (items.length === 0) {
        console.warn(
          `No valid items found in cache for segmentation: ${segmentationId}`
        );
        return;
      }

      // Process each item
      const { voxelsCleared, itemsProcessed } = processItems(
        items,
        segmentIndex,
        segmentationId
      );

      console.debug(
        `Processed ${itemsProcessed} items for segment ${segmentIndex} in segmentation ${segmentationId}, total voxels cleared: ${voxelsCleared}`
      );
    } else {
      throw new Error(
        `Invalid labelmap data structure for segmentation: ${segmentationId}`
      );
    }

    // Trigger update event
    triggerSegmentationDataModified(segmentationId);
  } catch (error) {
    console.error(
      `Failed to clear segment value ${segmentIndex} for segmentation ${segmentationId}:`,
      error
    );
    throw error;
  }
}
