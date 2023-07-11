import { SegmentationPublicInput } from '../../../types/SegmentationStateTypes';
import { cache } from '@cornerstonejs/core';
import type {
  LabelmapSegmentationData,
  LabelmapSegmentationDataVolume,
  LabelmapSegmentationDataStack,
} from '../../../types/LabelmapTypes';

function validate(segmentationInput: SegmentationPublicInput): void {
  if (!segmentationInput.representation.data) {
    throw new Error(
      'The segmentationInput.representationData.data is undefined, please provide a valid representationData.data'
    );
  }

  let representationData = segmentationInput.representation
    .data as LabelmapSegmentationData;

  if (representationData.type === 'volume') {
    representationData = segmentationInput.representation
      .data as LabelmapSegmentationDataVolume;
    if (!representationData.volumeId) {
      throw new Error(
        'The segmentationInput.representationData.volumeId is undefined, please provide a valid representationData.volumeId'
      );
    }

    const cachedVolume = cache.getVolume(representationData.volumeId);

    if (!cachedVolume) {
      throw new Error(
        `volumeId of ${representationData.volumeId} not found in cache, you should load and cache volume before adding segmentation`
      );
    }
  } else {
    representationData = segmentationInput.representation
      .data as LabelmapSegmentationDataStack;
    if (!representationData.imageIds) {
      throw new Error(
        'The segmentationInput.representationData.imageIds is undefined, please provide a valid representationData.imageIds'
      );
    }

    representationData.imageIds.forEach((imageId) => {
      const cachedImage = cache.getCachedImageBasedOnImageURI(imageId);

      if (!cachedImage) {
        throw new Error(
          `Image id ${imageId} not found in cache, you should load and cache images before adding segmentation`
        );
      }
    });
  }
}

export default validate;
