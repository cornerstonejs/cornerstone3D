import { cache, eventTarget, triggerEvent, Enums } from '@cornerstonejs/core';

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
  const labelmapData = representationData[
    type
  ] as LabelmapSegmentationDataVolume;
  const volumeIds = Object.values(labelmapData?.labelmaps ?? {})
    .map((layer) => layer.volumeId)
    .filter(Boolean) || [labelmapData.volumeId];

  volumeIds.forEach((volumeId) => {
    const segmentationVolume = cache.getVolume(volumeId);

    if (!segmentationVolume) {
      return;
    }

    const { imageData, vtkOpenGLTexture } = segmentationVolume;

    let slicesToUpdate;
    if (modifiedSlicesToUse?.length > 0) {
      slicesToUpdate = modifiedSlicesToUse;
    } else {
      const numSlices = imageData.getDimensions()[2];
      slicesToUpdate = [...Array(numSlices).keys()];
    }

    vtkOpenGLTexture?.setUpdatedFrame &&
      slicesToUpdate.forEach((i) => {
        vtkOpenGLTexture.setUpdatedFrame(i);
      });

    imageData.modified();

    const numberOfFrames =
      segmentationVolume.imageIds?.length ?? imageData.getDimensions()[2] ?? 0;
    const FrameOfReferenceUID =
      segmentationVolume.metadata?.FrameOfReferenceUID ?? '';

    triggerEvent(eventTarget, Enums.Events.IMAGE_VOLUME_MODIFIED, {
      volumeId: segmentationVolume.volumeId,
      FrameOfReferenceUID,
      numberOfFrames,
      framesProcessed: numberOfFrames,
    });
  });
}
