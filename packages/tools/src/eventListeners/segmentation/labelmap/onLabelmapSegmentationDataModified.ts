import {
  cache,
  utilities as csUtils,
  VolumeViewport,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { SegmentationDataModifiedEventType } from '../../../types/EventTypes';
import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onLabelmapSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId, modifiedSlicesToUse } = evt.detail;

  let modifiedSlices = modifiedSlicesToUse;

  const { representationData, type } =
    SegmentationState.getSegmentation(segmentationId);

  const labelmapRepresentationData = representationData[type];

  if (
    'stack' in labelmapRepresentationData &&
    'volumeId' in labelmapRepresentationData
  ) {
    // we need to take away the modifiedSlicesToUse from the stack
    // and update the volume for all the slices
    modifiedSlices = [];
  }

  if ('volumeId' in labelmapRepresentationData) {
    // get the volume from cache, we need the openGLTexture to be updated to GPU
    performVolumeLabelmapUpdate({
      modifiedSlicesToUse: modifiedSlices,
      representationData,
      type,
    });
  }

  const viewportIds =
    SegmentationState.getViewportIdsWithSegmentation(segmentationId);

  if ('imageIds' in labelmapRepresentationData) {
    // get the stack from cache, we need the imageData to be updated to GPU
    performStackLabelmapUpdate({
      viewportIds,
      segmentationId,
      representationData,
      type,
    });
  }
};

function performVolumeLabelmapUpdate({
  modifiedSlicesToUse,
  representationData,
  type,
}) {
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

function performStackLabelmapUpdate({
  viewportIds,
  segmentationId,
  representationData,
  type,
}) {
  viewportIds.forEach((viewportId) => {
    const viewportSegReps =
      SegmentationState.getSegmentationRepresentations(viewportId);

    viewportSegReps.forEach((representation) => {
      if (representation.segmentationId !== segmentationId) {
        return;
      }

      const enabledElement = getEnabledElementByViewportId(viewportId);

      if (!enabledElement) {
        return;
      }

      const { viewport } = enabledElement;

      if (viewport instanceof VolumeViewport) {
        return;
      }

      const actorEntry = viewport.getActor(
        representation.segmentationRepresentationUID
      );

      if (!actorEntry) {
        return;
      }

      const segImageData = actorEntry.actor.getMapper().getInputData();

      const currentSegmentationImageId =
        SegmentationState.getCurrentLabelmapImageIdForViewport(
          viewportId,
          representation.segmentationId
        );

      const segmentationImage = cache.getImage(currentSegmentationImageId);
      segImageData.modified();

      // update the cache with the new image data
      csUtils.updateVTKImageDataWithCornerstoneImage(
        segImageData,
        segmentationImage
      );
    });
  });
}

export default onLabelmapSegmentationDataModified;
