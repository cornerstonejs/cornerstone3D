/**
 * Utility functions for validating labelmap segmentation data structures.
 *
 * Supports validation for single-volume, multi-volume, and stack-based segmentations.
 * Throws descriptive errors if the segmentation data is invalid or if referenced volumes/images are not found in cache.
 *
 * - Single volume: `volumeId: string`
 * - Multi-volume: `volumeIds: string[]`
 * - Stack: `imageIds: string[]`
 *
 * Used internally to ensure segmentation data is well-formed before use.
 */
import { cache } from '@cornerstonejs/core';
import type { SegmentationPublicInput } from '../../types/SegmentationStateTypes';
import type {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';

/**
 * Validates the given labelmap segmentation representation data.
 *
 * Checks that all referenced volumes (for single or multi-volume segmentations) or imageIds (for stack segmentations) exist in the cache.
 * Throws an error if any required data is missing or not cached.
 *
 * @param segmentationRepresentationData - The labelmap segmentation representation data to validate.
 * @throws Error if a referenced volume or image is not found in cache, or if required fields are missing.
 */
function validateRepresentationData(
  segmentationRepresentationData: LabelmapSegmentationData
): void {
  if (
    'volumeIds' in segmentationRepresentationData &&
    Array.isArray(segmentationRepresentationData.volumeIds)
  ) {
    // Multi-volume segmentation: check all volumeIds
    for (const volumeId of segmentationRepresentationData.volumeIds) {
      const cachedVolume = cache.getVolume(volumeId);
      if (!cachedVolume) {
        throw new Error(
          `volumeId of ${volumeId} not found in cache, you should load and cache volume before adding segmentation`
        );
      }
    }
  } else if ('volumeId' in segmentationRepresentationData) {
    // Single-volume segmentation: check volumeId
    segmentationRepresentationData =
      segmentationRepresentationData as LabelmapSegmentationDataVolume;

    const cachedVolume = cache.getVolume(
      segmentationRepresentationData.volumeId
    );

    if (!cachedVolume) {
      throw new Error(
        `volumeId of ${segmentationRepresentationData.volumeId} not found in cache, you should load and cache volume before adding segmentation`
      );
    }
  } else if ('imageIds' in segmentationRepresentationData) {
    // Stack segmentation: check imageIds
    const segmentationRepresentationDataStack =
      segmentationRepresentationData as LabelmapSegmentationDataStack;

    if (!segmentationRepresentationDataStack.imageIds) {
      throw new Error(
        'The segmentationInput.representationData.imageIds is undefined, please provide a valid representationData.imageIds for stack data'
      );
    }
  } else {
    throw new Error(
      'The segmentationInput.representationData is undefined, please provide a valid representationData'
    );
  }
}

/**
 * Validates the public segmentation input for labelmap segmentations.
 *
 * Throws an error if the segmentation input or its representation data is invalid or missing.
 *
 * @param segmentationInput - The segmentation input to validate.
 * @throws Error if the segmentation input or its representation data is invalid.
 */
export function validatePublic(
  segmentationInput: SegmentationPublicInput
): void {
  if (!segmentationInput.representation.data) {
    throw new Error(
      'The segmentationInput.representationData.data is undefined, please provide a valid representationData.data'
    );
  }

  const representationData = segmentationInput.representation
    .data as LabelmapSegmentationData;

  validateRepresentationData(representationData);
}

/**
 * Validates the given labelmap segmentation representation data.
 *
 * Throws an error if the representation data is invalid or references missing volumes/images.
 *
 * @param segmentationRepresentationData - The labelmap segmentation representation data to validate.
 * @throws Error if the representation data is invalid or references missing data.
 */
export function validate(
  segmentationRepresentationData: LabelmapSegmentationData
) {
  validateRepresentationData(segmentationRepresentationData);
}
