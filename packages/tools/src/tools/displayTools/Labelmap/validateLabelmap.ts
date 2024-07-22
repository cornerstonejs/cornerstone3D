import { cache } from '@cornerstonejs/core';
import { SegmentationPublicInput } from '../../../types/SegmentationStateTypes';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';

function validateRepresentationData(
  segmentationRepresentationData: LabelmapSegmentationData
): void {
  if ('volumeId' in segmentationRepresentationData) {
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
    segmentationRepresentationData =
      segmentationRepresentationData as LabelmapSegmentationDataStack;

    if (!segmentationRepresentationData.imageIds) {
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
 * Validates the public segmentation input.
 * Throws an error if the segmentation input is invalid.
 *
 * @param segmentationInput - The segmentation input to validate.
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
 * Validates the given segmentation representation data.
 *
 * @param segmentationRepresentationData The segmentation representation data to validate.
 */
export function validate(
  segmentationRepresentationData: LabelmapSegmentationData
) {
  validateRepresentationData(segmentationRepresentationData);
}
