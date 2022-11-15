import { cache } from '@cornerstonejs/core';

import triggerSegmentationRender from '../../utilities/segmentation/triggerSegmentationRender';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState';
import { SegmentationDataModifiedEventType } from '../../types/EventTypes';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId, modifiedSlicesToUse } = evt.detail;

  const { representationData, type } =
    SegmentationState.getSegmentation(segmentationId);

  let toolGroupIds;
  if (type === SegmentationRepresentations.Labelmap) {
    // get the volume from cache, we need the openGLTexture to be updated to GPU
    const segmentationVolume = cache.getVolume(
      representationData[type].volumeId
    );

    if (!segmentationVolume) {
      console.warn('segmentation not found in cache');
      return;
    }

    const { imageData, vtkOpenGLTexture } = segmentationVolume;

    // Update the texture for the volume in the GPU
    let slicesToUpdate;
    if (modifiedSlicesToUse && Array.isArray(modifiedSlicesToUse)) {
      slicesToUpdate = modifiedSlicesToUse;
    } else {
      const numSlices = imageData.getDimensions()[2];
      slicesToUpdate = [...Array(numSlices).keys()];
    }

    slicesToUpdate.forEach((i) => {
      vtkOpenGLTexture.setUpdatedFrame(i);
    });

    // Trigger modified on the imageData to update the image
    imageData.modified();
    toolGroupIds =
      SegmentationState.getToolGroupIdsWithSegmentation(segmentationId);
  } else {
    throw new Error(
      `onSegmentationDataModified: representationType ${type} not supported yet`
    );
  }

  toolGroupIds.forEach((toolGroupId) => {
    triggerSegmentationRender(toolGroupId);
  });
};

export default onSegmentationDataModified;
