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

  const representationData = segmentationInput.representation
    .data as LabelmapSegmentationData;

  if ('volumeId' in representationData) {
    // volumetric labelmap
    const cachedVolume = cache.getVolume(
      (representationData as LabelmapSegmentationDataVolume).volumeId
    );

    if (!cachedVolume) {
      throw new Error(
        `volumeId of ${
          (representationData as LabelmapSegmentationDataVolume).volumeId
        } not found in cache, you should load and cache volume before adding segmentation`
      );
    }
  } else {
    // stack labelmap
    if (!(representationData as LabelmapSegmentationDataStack).imageIds) {
      throw new Error(
        'The segmentationInput.representationData.imageIds is undefined, please provide a valid representationData.imageIds'
      );
    }

    (representationData as LabelmapSegmentationDataStack).imageIds.forEach(
      (imageId) => {
        const cachedImage = cache.getCachedImageBasedOnImageURI(imageId);

        if (!cachedImage) {
          throw new Error(
            `Image id ${imageId} not found in cache, you should load and cache images before adding segmentation`
          );
        }
      }
    );
  }
}

export default validate;
