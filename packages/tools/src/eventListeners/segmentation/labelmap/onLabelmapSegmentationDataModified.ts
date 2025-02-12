import {
  cache,
  utilities as csUtils,
  VolumeViewport,
  getEnabledElementByViewportId,
  StackViewport,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import type { SegmentationDataModifiedEventType } from '../../../types/EventTypes';
import type { LabelmapSegmentationDataVolume } from '../../../types/LabelmapTypes';
import { SegmentationRepresentations } from '../../../enums';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onLabelmapSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId, modifiedSlicesToUse } = evt.detail;

  const { representationData } =
    SegmentationState.getSegmentation(segmentationId);

  const viewportIds =
    SegmentationState.getViewportIdsWithSegmentation(segmentationId);

  const hasVolumeViewport = viewportIds.some((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);
    return viewport instanceof VolumeViewport;
  });

  const hasStackViewport = viewportIds.some((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);
    return viewport instanceof StackViewport;
  });

  const hasBothStackAndVolume = hasVolumeViewport && hasStackViewport;

  viewportIds.forEach((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);

    if (viewport instanceof VolumeViewport) {
      // For combined stack and volume scenarios in the rendering engine, updating only affected
      // slices is not ideal. Stack indices (e.g., 0 for just one image) don't
      // correspond to image indices in the volume. In this case, we update all slices.
      // However, for volume-only scenarios, we update only affected slices.

      performVolumeLabelmapUpdate({
        modifiedSlicesToUse: hasBothStackAndVolume ? [] : modifiedSlicesToUse,
        representationData,
        type: SegmentationRepresentations.Labelmap,
      });
    }

    if (viewport instanceof StackViewport) {
      performStackLabelmapUpdate({
        viewportIds,
        segmentationId,
      });
    }
  });

  // Todo: i don't think we need this anymore
  // if (
  //   'stack' in labelmapRepresentationData &&
  //   'volumeId' in labelmapRepresentationData
  // ) {
  //   // we need to take away the modifiedSlicesToUse from the stack
  //   // and update the volume for all the slices
  //   modifiedSlices = [];
  // }
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

function performStackLabelmapUpdate({ viewportIds, segmentationId }) {
  viewportIds.forEach((viewportId) => {
    let representations = SegmentationState.getSegmentationRepresentations(
      viewportId,
      { segmentationId }
    );

    representations = representations.filter(
      (representation) =>
        representation.type === SegmentationRepresentations.Labelmap
    );

    representations.forEach((representation) => {
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

      const actorEntries = getLabelmapActorEntries(viewportId, segmentationId);

      if (!actorEntries) {
        return;
      }

      actorEntries.forEach((actorEntry) => {
        const segImageData = actorEntry.actor.getMapper().getInputData();

        const currentSegmentationImageId =
          SegmentationState.getCurrentLabelmapImageIdForViewport(
            viewportId,
            segmentationId
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
  });
}

export default onLabelmapSegmentationDataModified;
