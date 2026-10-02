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
  voxelsUnchanged = false,
}: {
  modifiedSlicesToUse: number[];
  representationData: Record<string, unknown>;
  type: SegmentationRepresentations;
  /**
   * No voxel changed (a representation was added), so the volume skips the
   * frame marks, which re-reduce its derived representations, and only renders.
   */
  voxelsUnchanged?: boolean;
}): void {
  const labelmapData = representationData[
    type
  ] as LabelmapSegmentationDataVolume;
  const volumes = getVolumesToUpdate(labelmapData);

  volumes.forEach((segmentationVolume) => {
    const { imageData, voxelManager } = segmentationVolume;

    if (voxelsUnchanged) {
      triggerVolumeModified(segmentationVolume);
      return;
    }

    let slicesToUpdate;
    if (modifiedSlicesToUse?.length > 0) {
      slicesToUpdate = modifiedSlicesToUse;
    } else {
      const numSlices = imageData.getDimensions()[2];
      slicesToUpdate = [...Array(numSlices).keys()];
    }

    // The volume holds a pool of textures, so one slice is dirty in every
    // texture whose grid covers that slice, and `markFrameDirty` fans the mark
    // out to each of them.
    segmentationVolume.markFrameDirty &&
      slicesToUpdate.forEach((i) => {
        segmentationVolume.markFrameDirty(i);
      });

    voxelManager?.invalidateCache?.();
    imageData.modified();
    triggerVolumeModified(segmentationVolume);
  });
}

/** Tells the viewports that hold the volume to render it. */
function triggerVolumeModified(
  segmentationVolume: NonNullable<ReturnType<typeof cache.getVolume>>
): void {
  const { imageData } = segmentationVolume;
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
