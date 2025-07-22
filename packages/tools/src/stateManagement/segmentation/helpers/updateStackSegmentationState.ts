import { cache, eventTarget } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../../enums';
import { getSegmentation } from '../getSegmentation';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';
import { triggerSegmentationDataModified } from '../triggerSegmentationEvents';
import { addSegmentationRepresentations } from '../addSegmentationRepresentationsToViewport';

/**
 * Configuration options for stack segmentation state update
 */
interface UpdateStackSegmentationOptions {
  removeOriginal?: boolean;
  newSegmentationId?: string;
  validateImageIds?: boolean;
}

/**
 * Result interface for stack segmentation state update
 */
interface UpdateStackSegmentationResult {
  success: boolean;
  segmentationId: string;
  processedImageIds: number;
  removedVolumeIds?: string[];
  error?: string;
}

/**
 * Validates input parameters for updateStackSegmentationState
 */
function validateInputs(
  segmentationId: string,
  viewportId: string,
  imageIds: string[]
): void {
  if (!segmentationId || typeof segmentationId !== 'string') {
    throw new Error('Valid segmentation ID is required');
  }

  if (!viewportId || typeof viewportId !== 'string') {
    throw new Error('Valid viewport ID is required');
  }

  if (!Array.isArray(imageIds)) {
    throw new Error('Valid imageIds array is required');
  }

  if (imageIds.length === 0) {
    throw new Error('ImageIds array cannot be empty');
  }
}

/**
 * Validates and filters imageIds to ensure they are valid
 */
function validateImageIds(imageIds: string[]): {
  validImageIds: string[];
  invalidCount: number;
} {
  const validImageIds = imageIds.filter(
    (imageId) =>
      imageId && typeof imageId === 'string' && imageId.trim().length > 0
  );

  const invalidCount = imageIds.length - validImageIds.length;

  if (invalidCount > 0) {
    console.warn(
      `Found ${invalidCount} invalid imageIds out of ${imageIds.length} total`
    );
  }

  return { validImageIds, invalidCount };
}

/**
 * Safely removes volume load objects from cache
 */
function removeVolumeLoadObjects(volumeIds: string[]): string[] {
  const removedVolumeIds: string[] = [];

  volumeIds.forEach((volumeId: string) => {
    try {
      if (cache.getVolume(volumeId)) {
        cache.removeVolumeLoadObject(volumeId);
        removedVolumeIds.push(volumeId);
        console.debug(`Successfully removed volume from cache: ${volumeId}`);
      } else {
        console.warn(`Volume not found in cache: ${volumeId}`);
      }
    } catch (error) {
      console.error(`Failed to remove volume ${volumeId} from cache:`, error);
    }
  });

  return removedVolumeIds;
}

/**
 * Converts a volume segmentation to a stack segmentation.
 *
 * @param params - The parameters for the conversion.
 * @param params.segmentationId - The segmentationId to convert.
 * @param params.viewportId - The viewportId to use for the segmentation.
 * @param params.imageIds - Array of image IDs to use for the stack segmentation.
 * @param params.options - The conversion options.
 * @param params.options.removeOriginal - Whether or not to remove the original segmentation. Defaults to false.
 * @param params.options.newSegmentationId - The new segmentationId to use for the segmentation. If not provided, uses the original ID.
 * @param params.options.validateImageIds - Whether to validate and filter invalid imageIds. Defaults to true.
 *
 * @returns A promise that resolves to the update result with success status and details.
 * @throws {Error} If input parameters are invalid or segmentation is not found.
 */
export async function updateStackSegmentationState({
  segmentationId,
  viewportId,
  imageIds,
  options,
}: {
  segmentationId: string;
  viewportId: string;
  imageIds: string[];
  options?: UpdateStackSegmentationOptions;
}): Promise<UpdateStackSegmentationResult> {
  try {
    // Input validation
    validateInputs(segmentationId, viewportId, imageIds);

    const segmentation = getSegmentation(segmentationId);
    if (!segmentation) {
      const error = `Segmentation not found: ${segmentationId}`;
      console.error(error);
      return {
        success: false,
        segmentationId,
        processedImageIds: 0,
        error,
      };
    }

    // Validate segmentation has Labelmap representation
    if (!segmentation.representationData?.Labelmap) {
      const error = `Segmentation ${segmentationId} does not have Labelmap representation data`;
      console.error(error);
      return {
        success: false,
        segmentationId,
        processedImageIds: 0,
        error,
      };
    }

    // Validate and filter imageIds if requested
    let processedImageIds = imageIds;
    if (options?.validateImageIds !== false) {
      const { validImageIds, invalidCount } = validateImageIds(imageIds);

      if (validImageIds.length === 0) {
        const error = 'No valid imageIds found after validation';
        console.error(error);
        return {
          success: false,
          segmentationId,
          processedImageIds: 0,
          error,
        };
      }

      processedImageIds = validImageIds;

      if (invalidCount > 0) {
        console.warn(
          `Using ${validImageIds.length} valid imageIds, filtered out ${invalidCount} invalid ones`
        );
      }
    }

    let removedVolumeIds: string[] = [];

    // Handle volume removal if requested
    if (options?.removeOriginal) {
      try {
        const data = segmentation.representationData
          .Labelmap as LabelmapSegmentationDataVolume;
        const volumeIds = data.volumeIds || [];

        if (volumeIds.length > 0) {
          removedVolumeIds = removeVolumeLoadObjects(volumeIds);
          console.debug(
            `Removed ${removedVolumeIds.length} volume(s) from cache out of ${volumeIds.length} total`
          );
        }

        // Replace with stack representation
        segmentation.representationData.Labelmap = {
          imageIds: processedImageIds,
        };
      } catch (error) {
        console.error('Failed to remove original volumes:', error);
        // Continue with conversion even if volume removal fails
      }
    } else {
      // Merge with existing representation
      segmentation.representationData.Labelmap = {
        ...segmentation.representationData.Labelmap,
        imageIds: processedImageIds,
      };
    }

    // Add segmentation representations to viewport
    await addSegmentationRepresentations(viewportId, [
      {
        segmentationId,
        type: SegmentationRepresentations.Labelmap,
      },
    ]);

    // Trigger segmentation data modified event after rendering
    eventTarget.addEventListenerOnce(Events.SEGMENTATION_RENDERED, () => {
      try {
        triggerSegmentationDataModified(segmentationId);
        console.debug(
          `Successfully updated stack segmentation state for ${segmentationId} with ${processedImageIds.length} images`
        );
      } catch (error) {
        console.error(
          'Failed to trigger segmentation data modified event:',
          error
        );
      }
    });

    return {
      success: true,
      segmentationId,
      processedImageIds: processedImageIds.length,
      removedVolumeIds:
        removedVolumeIds.length > 0 ? removedVolumeIds : undefined,
    };
  } catch (error) {
    const errorMessage = `Failed to update stack segmentation state for ${segmentationId}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMessage, error);
    return {
      success: false,
      segmentationId,
      processedImageIds: 0,
      error: errorMessage,
    };
  }
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use updateStackSegmentationState with proper error handling instead.
 */
export async function updateStackSegmentationStateLegacy({
  segmentationId,
  viewportId,
  imageIds,
  options,
}: {
  segmentationId: string;
  viewportId: string;
  imageIds: string[];
  options?: {
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const result = await updateStackSegmentationState({
    segmentationId,
    viewportId,
    imageIds,
    options: {
      removeOriginal: options?.removeOriginal,
      validateImageIds: true,
    },
  });

  if (!result.success) {
    throw new Error(
      result.error || 'Failed to update stack segmentation state'
    );
  }
}

/**
 * Utility function to check if a segmentation can be converted to stack representation
 */
export function canConvertToStackSegmentation(segmentationId: string): {
  canConvert: boolean;
  reason?: string;
  volumeCount?: number;
} {
  try {
    const segmentation = getSegmentation(segmentationId);

    if (!segmentation) {
      return {
        canConvert: false,
        reason: 'Segmentation not found',
      };
    }

    if (!segmentation.representationData?.Labelmap) {
      return {
        canConvert: false,
        reason: 'No Labelmap representation data found',
      };
    }

    const labelmapData = segmentation.representationData
      .Labelmap as LabelmapSegmentationDataVolume;

    // Check if it's already a stack segmentation
    if ('imageIds' in labelmapData && labelmapData.imageIds) {
      return {
        canConvert: false,
        reason: 'Already a stack segmentation',
      };
    }

    // Check if it has volume data
    if (!labelmapData.volumeIds || labelmapData.volumeIds.length === 0) {
      return {
        canConvert: false,
        reason: 'No volume IDs found',
      };
    }

    // Check if volumes exist in cache
    const validVolumeCount = labelmapData.volumeIds.filter((volumeId) =>
      cache.getVolume(volumeId)
    ).length;

    if (validVolumeCount === 0) {
      return {
        canConvert: false,
        reason: 'No volumes found in cache',
        volumeCount: labelmapData.volumeIds.length,
      };
    }

    return {
      canConvert: true,
      volumeCount: validVolumeCount,
    };
  } catch (error) {
    return {
      canConvert: false,
      reason: `Error checking conversion eligibility: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
