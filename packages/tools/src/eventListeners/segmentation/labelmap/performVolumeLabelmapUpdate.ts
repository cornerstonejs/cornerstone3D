import { cache, eventTarget, triggerEvent, Enums } from '@cornerstonejs/core';

import type { SegmentationRepresentations } from '../../../enums';
import type {
  LabelmapLayer,
  LabelmapSegmentationDataVolume,
} from '../../../types/LabelmapTypes';
import { getOrCreateLabelmapVolume } from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';

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
  const volumes = getVolumesToUpdate(labelmapData);

  volumes.forEach((segmentationVolume) => {
    const { imageData, vtkOpenGLTexture, voxelManager } = segmentationVolume;

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

    voxelManager?.invalidateCache?.();
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

function getVolumesToUpdate(
  labelmapData: LabelmapSegmentationDataVolume
): Array<NonNullable<ReturnType<typeof cache.getVolume>>> {
  const volumes: Array<NonNullable<ReturnType<typeof cache.getVolume>>> = [];
  const seenVolumeIds = new Set<string>();

  const addVolume = (volume?: ReturnType<typeof cache.getVolume>) => {
    if (!volume?.volumeId || seenVolumeIds.has(volume.volumeId)) {
      return;
    }

    seenVolumeIds.add(volume.volumeId);
    volumes.push(volume);
  };

  Object.values(labelmapData?.labelmaps ?? {}).forEach(
    (layer: LabelmapLayer) => {
      addVolume(getOrCreateLabelmapVolume(layer));
    }
  );

  addVolume(labelmapData?.volumeId && cache.getVolume(labelmapData.volumeId));

  return volumes;
}
