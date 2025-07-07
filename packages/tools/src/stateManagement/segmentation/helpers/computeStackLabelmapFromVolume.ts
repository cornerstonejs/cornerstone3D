import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { updateStackSegmentationState } from '../helpers/updateStackSegmentationState';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';

/**
 * Result interface for stack labelmap computation
 */
interface ComputeStackLabelmapResult {
  imageIds: string[];
  success: boolean;
  volumeId?: string;
  error?: string;
}

/**
 * Configuration options for volume to stack conversion
 */
interface ConversionOptions {
  viewportId: string;
  newSegmentationId?: string;
  removeOriginal?: boolean;
}

/**
 * Result interface for volume to stack conversion
 */
interface ConversionResult {
  success: boolean;
  segmentationId: string;
  imageIds?: string[];
  processedVolumeIds?: string[];
  failedVolumeIds?: string[];
  error?: string;
}

/**
 * Validates volume ID input
 */
function validateVolumeId(volumeId: string): void {
  if (!volumeId || typeof volumeId !== 'string') {
    throw new Error('Valid volume ID is required');
  }
}

/**
 * Validates segmentation ID input
 */
function validateSegmentationId(segmentationId: string): void {
  if (!segmentationId || typeof segmentationId !== 'string') {
    throw new Error('Valid segmentation ID is required');
  }
}

/**
 * Validates conversion options
 */
function validateConversionOptions(options?: ConversionOptions): void {
  if (!options) {
    throw new Error('Conversion options are required');
  }

  if (!options.viewportId || typeof options.viewportId !== 'string') {
    throw new Error('Valid viewport ID is required in options');
  }
}

/**
 * Retrieves and validates volume from cache
 */
function getValidatedVolumeFromCache(
  volumeId: string
): Types.IImageVolume | null {
  const volume = cache.getVolume(volumeId) as Types.IImageVolume;

  if (!volume) {
    console.error(`Volume not found in cache: ${volumeId}`);
    return null;
  }

  if (!volume.imageIds || volume.imageIds.length === 0) {
    console.error(`Volume ${volumeId} has no imageIds`);
    return null;
  }

  return volume;
}

/**
 * Processes multiple volumes and aggregates their imageIds
 */
function processMultipleVolumes(volumeIds: string[]): {
  allImageIds: string[];
  processedVolumeIds: string[];
  failedVolumeIds: string[];
} {
  const allImageIds: string[] = [];
  const processedVolumeIds: string[] = [];
  const failedVolumeIds: string[] = [];

  for (const volumeId of volumeIds) {
    try {
      const volume = getValidatedVolumeFromCache(volumeId);

      if (volume) {
        // Validate and filter imageIds for this volume
        const validImageIds = volume.imageIds.filter(
          (imageId) => imageId && typeof imageId === 'string'
        );

        if (validImageIds.length > 0) {
          allImageIds.push(...validImageIds);
          processedVolumeIds.push(volumeId);

          if (validImageIds.length !== volume.imageIds.length) {
            console.warn(
              `Some imageIds in volume ${volumeId} are invalid. ` +
                `Found ${validImageIds.length} valid out of ${volume.imageIds.length} total`
            );
          }
        } else {
          console.warn(`Volume ${volumeId} has no valid imageIds`);
          failedVolumeIds.push(volumeId);
        }
      } else {
        failedVolumeIds.push(volumeId);
      }
    } catch (error) {
      console.error(`Failed to process volume ${volumeId}:`, error);
      failedVolumeIds.push(volumeId);
    }
  }

  return { allImageIds, processedVolumeIds, failedVolumeIds };
}

/**
 * Computes stack labelmap data from a volume by extracting the imageIds.
 * This function retrieves the volume from cache and returns its associated imageIds.
 *
 * @param volumeId - The ID of the volume to extract imageIds from
 * @returns Promise resolving to an object containing the imageIds array and success status
 * @throws {Error} If volume ID is invalid or volume not found in cache
 */
export async function computeStackLabelmapFromVolume({
  volumeId,
}: {
  volumeId: string;
}): Promise<ComputeStackLabelmapResult> {
  // Use the multi-volume function with a single volume for consistency
  const result = await computeStackLabelmapFromMultipleVolumes({
    volumeIds: [volumeId],
  });

  // Return simplified result for single volume case
  return {
    imageIds: result.imageIds,
    success: result.success,
    volumeId,
    error: result.error,
  };
}

/**
 * Converts a volume labelmap segmentation to a stack labelmap representation.
 * This function retrieves the segmentation data, processes all volumeIds from the volumeIds array,
 * gets the corresponding volumes from cache, combines their imageIds, and updates the stack
 * segmentation state with the combined imageIds.
 *
 * Now supports multi-volume handling - all volumes will be processed and their imageIds combined.
 *
 * @param segmentationId - The ID of the segmentation to convert
 * @param options - Configuration options for the conversion
 * @param options.viewportId - The viewport ID where the conversion should be applied
 * @param options.newSegmentationId - Optional new ID for the converted segmentation
 * @param options.removeOriginal - Whether to remove the original volume segmentation after conversion
 * @returns Promise that resolves to conversion result with success status
 * @throws {Error} If input parameters are invalid
 */
export async function convertVolumeToStackLabelmap({
  segmentationId,
  options,
}: {
  segmentationId: string;
  options?: ConversionOptions;
}): Promise<ConversionResult> {
  try {
    // Input validation
    validateSegmentationId(segmentationId);
    validateConversionOptions(options);

    const segmentation = getSegmentation(segmentationId);
    if (!segmentation) {
      const error = `Segmentation not found: ${segmentationId}`;
      console.error(error);
      return {
        success: false,
        segmentationId,
        processedVolumeIds: [],
        failedVolumeIds: [],
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
        processedVolumeIds: [],
        failedVolumeIds: [],
        error,
      };
    }

    const labelmapData = segmentation.representationData
      .Labelmap as LabelmapSegmentationDataVolume;
    const volumeIds = labelmapData.volumeIds;

    if (!volumeIds || volumeIds.length === 0) {
      const error = 'No volumeIds found in segmentation representation data';
      console.warn(error);
      return {
        success: false,
        segmentationId,
        processedVolumeIds: [],
        failedVolumeIds: [],
        error,
      };
    }

    // Process all volumes and combine their imageIds
    console.debug(
      `Processing ${volumeIds.length} volume(s) for segmentation ${segmentationId}`
    );

    const { allImageIds, processedVolumeIds, failedVolumeIds } =
      processMultipleVolumes(volumeIds);

    // Log processing results
    if (failedVolumeIds.length > 0) {
      console.warn(
        `Failed to process ${failedVolumeIds.length} out of ${volumeIds.length} volumes: ` +
          failedVolumeIds.join(', ')
      );
    }

    if (processedVolumeIds.length === 0) {
      const error = 'No volumes could be processed successfully';
      console.error(error);
      return {
        success: false,
        segmentationId,
        processedVolumeIds: [],
        failedVolumeIds,
        error,
      };
    }

    if (allImageIds.length === 0) {
      const error = 'No imageIds found in any of the processed volumes';
      console.error(error);
      return {
        success: false,
        segmentationId,
        processedVolumeIds,
        failedVolumeIds,
        error,
      };
    }

    // Update stack segmentation state with combined imageIds
    await updateStackSegmentationState({
      segmentationId,
      viewportId: options.viewportId,
      imageIds: allImageIds,
      options,
    });

    console.debug(
      `Successfully converted volume labelmap to stack labelmap for segmentation ${segmentationId} ` +
        `with ${allImageIds.length} images from ${processedVolumeIds.length} volume(s)`
    );

    return {
      success: true,
      segmentationId,
      imageIds: allImageIds,
      processedVolumeIds,
      failedVolumeIds,
    };
  } catch (error) {
    const errorMessage = `Failed to convert volume to stack labelmap for segmentation ${segmentationId}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMessage, error);
    return {
      success: false,
      segmentationId,
      processedVolumeIds: [],
      failedVolumeIds: [],
      error: errorMessage,
    };
  }
}

/**
 * Computes stack labelmap data from multiple volumes by extracting and combining their imageIds.
 * This function retrieves multiple volumes from cache and returns their combined imageIds.
 *
 * @param volumeIds - Array of volume IDs to extract imageIds from
 * @returns Promise resolving to an object containing the combined imageIds array and processing details
 * @throws {Error} If volumeIds array is invalid
 */
export async function computeStackLabelmapFromMultipleVolumes({
  volumeIds,
}: {
  volumeIds: string[];
}): Promise<
  ComputeStackLabelmapResult & {
    processedVolumeIds: string[];
    failedVolumeIds: string[];
  }
> {
  try {
    // Input validation
    if (!Array.isArray(volumeIds) || volumeIds.length === 0) {
      throw new Error('Valid array of volume IDs is required');
    }

    // Validate each volume ID
    volumeIds.forEach((volumeId) => validateVolumeId(volumeId));

    // Process all volumes and aggregate imageIds
    const { allImageIds, processedVolumeIds, failedVolumeIds } =
      processMultipleVolumes(volumeIds);

    // Log processing results
    if (failedVolumeIds.length > 0) {
      console.warn(
        `Failed to process ${failedVolumeIds.length} out of ${volumeIds.length} volumes: ` +
          failedVolumeIds.join(', ')
      );
    }

    if (processedVolumeIds.length === 0) {
      return {
        imageIds: [],
        success: false,
        processedVolumeIds: [],
        failedVolumeIds,
        error: 'No volumes could be processed successfully',
      };
    }

    console.debug(
      `Successfully processed ${processedVolumeIds.length} volumes, ` +
        `combined ${allImageIds.length} imageIds`
    );

    return {
      imageIds: allImageIds,
      success: true,
      processedVolumeIds,
      failedVolumeIds,
    };
  } catch (error) {
    const errorMessage = `Failed to compute stack labelmap from multiple volumes: ${
      error instanceof Error ? error.message : String(error)
    }`;
    console.error(errorMessage, error);
    return {
      imageIds: [],
      success: false,
      processedVolumeIds: [],
      failedVolumeIds: Array.isArray(volumeIds) ? volumeIds : [],
      error: errorMessage,
    };
  }
}
