import { cache } from '@cornerstonejs/core';

import type { SegmentationRepresentations } from '../../../enums';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';

/**
 * Updates the labelmap volume in GPU for volume viewports
 */
export function performVolumeLabelmapUpdate({
  modifiedSlicesToUse,
  representationData,
  type,
}: {
  modifiedSlicesToUse: number[];
  representationData: Record<string, unknown>;
  type: SegmentationRepresentations;
}): void {
  const segmentationVolume = cache.getVolume(
    (representationData[type] as LabelmapSegmentationDataVolume).volumeId
  );

  if (!segmentationVolume) {
    console.warn('segmentation not found in cache');
    return;
  }

  const { imageData, vtkOpenGLTexture } = segmentationVolume;

  // Update the texture for the volume in the GPU
  let slicesToUpdate;
  if (modifiedSlicesToUse?.length > 0) {
    slicesToUpdate = modifiedSlicesToUse;
  } else {
    const numSlices = imageData.getDimensions()[2];
    slicesToUpdate = [...Array(numSlices).keys()];
  }

  slicesToUpdate.forEach((i) => {
    vtkOpenGLTexture.setUpdatedFrame(i);
  });

  // Trigger modified on the imageData to update the image
  // this is the start of the rendering pipeline for updating the texture
  // to the gpu
  imageData.modified();
}
