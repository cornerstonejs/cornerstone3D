import {
  cache,
  getEnabledElementByIds,
  utilities as csUtils,
  VolumeViewport,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { SegmentationDataModifiedEventType } from '../../../types/EventTypes';
import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';
import { getToolGroup } from '../../../store/ToolGroupManager';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onLabelmapSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId, modifiedSlicesToUse } = evt.detail;

  const { representationData, type } =
    SegmentationState.getSegmentation(segmentationId);

  const toolGroupIds =
    SegmentationState.getToolGroupIdsWithSegmentation(segmentationId);

  const labelmapRepresentationData = representationData[type];

  if ('volumeId' in labelmapRepresentationData) {
    // get the volume from cache, we need the openGLTexture to be updated to GPU
    performVolumeLabelmapUpdate({
      modifiedSlicesToUse,
      representationData,
      type,
    });
  }

  if ('imageIdReferenceMap' in labelmapRepresentationData) {
    // get the stack from cache, we need the imageData to be updated to GPU
    performStackLabelmapUpdate({
      toolGroupIds,
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
}

function performStackLabelmapUpdate({
  toolGroupIds,
  segmentationId,
  representationData,
  type,
}) {
  toolGroupIds.forEach((toolGroupId) => {
    const toolGroupSegmentationRepresentations =
      SegmentationState.getSegmentationRepresentations(toolGroupId);

    const toolGroup = getToolGroup(toolGroupId);
    const viewportsInfo = toolGroup.getViewportsInfo();

    toolGroupSegmentationRepresentations.forEach((representation) => {
      if (representation.segmentationId !== segmentationId) {
        return;
      }

      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        const viewport = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        ).viewport;

        if (viewport instanceof VolumeViewport) {
          return;
        }

        const actorEntry = viewport.getActor(
          representation.segmentationRepresentationUID
        );

        if (!actorEntry) {
          return;
        }

        const currentImageId = viewport.getCurrentImageId();

        const segImageData = actorEntry.actor.getMapper().getInputData();

        const { imageIdReferenceMap } = representationData[
          type
        ] as LabelmapSegmentationDataStack;

        const currentSegmentationImageId =
          imageIdReferenceMap.get(currentImageId);

        const segmentationImage = cache.getImage(currentSegmentationImageId);
        segImageData.modified();

        // update the cache with the new image data
        csUtils.updateVTKImageDataWithCornerstoneImage(
          segImageData,
          segmentationImage
        );
      });
    });
  });
}

export default onLabelmapSegmentationDataModified;
