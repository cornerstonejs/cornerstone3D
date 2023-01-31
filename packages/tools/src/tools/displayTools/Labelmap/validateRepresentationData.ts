import { SegmentationPublicInput } from '../../../types/SegmentationStateTypes';
import { cache } from '@cornerstonejs/core';
import { LabelmapSegmentationData } from '../../../types/LabelmapTypes';

function validate(segmentationInput: SegmentationPublicInput): void {
  if (!segmentationInput.representation.data) {
    throw new Error(
      'The segmentationInput.representationData.data is undefined, please provide a valid representationData.data'
    );
  }

  const representationData = segmentationInput.representation
    .data as LabelmapSegmentationData;

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
}

export default validate;
