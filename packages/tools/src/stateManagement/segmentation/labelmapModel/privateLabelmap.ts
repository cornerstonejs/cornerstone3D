import {
  cache,
  imageLoader,
  utilities as csUtils,
  volumeLoader,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
import {
  getLabelmap,
  registerLabelmap,
  removeLabelmap,
} from './labelmapLayerStore';
import {
  getSegmentBinding,
  getSegmentsOnLabelmap,
  setSegmentBinding,
} from './labelmapSegmentBindings';
import { syncLegacyLabelmapData } from './labelmapLegacyAdapter';
import type { LabelmapRestoreStep } from '../../../utilities/segmentation/createLabelmapMemo';

/** One source->target voxel-manager pair touched by a segment move,
 *  with the indices whose value moved. */
type MovedVoxels = {
  source: Types.IVoxelManager<number>;
  target: Types.IVoxelManager<number>;
  indices: number[];
};

type MoveSegmentToPrivateLabelmapOptions = {
  /** When provided, receives an undo/redo step that reverses/replays the whole
   *  move (layer registration, bulk voxel move, and binding change).
   *  The step does NOT fire segmentation events itself - the recorder is
   *  expected to wrap it with the appropriate data-modified notification. */
  moveStepCallback?: (step: LabelmapRestoreStep) => void;
};

function createPrivateVolumeLabelmap(
  segmentation: Segmentation,
  sourceLabelmap: LabelmapLayer
): LabelmapLayer {
  const sourceVolume = cache.getVolume(sourceLabelmap.volumeId);
  const volumeId = `${segmentation.segmentationId}-storage-${csUtils.uuidv4()}`;
  const referencedVolumeId =
    sourceLabelmap.referencedVolumeId ??
    sourceVolume?.referencedVolumeId ??
    sourceLabelmap.volumeId;

  const volume = volumeLoader.createAndCacheDerivedLabelmapVolume(
    referencedVolumeId,
    {
      volumeId,
    }
  );

  return {
    labelmapId: volumeId,
    storageKind: 'volume',
    volumeId,
    imageIds: volume.imageIds,
    referencedVolumeId,
    referencedImageIds:
      sourceLabelmap.referencedImageIds ?? sourceVolume?.referencedImageIds,
    labelToSegmentIndex: {},
  };
}

function createPrivateStackLabelmap(
  segmentation: Segmentation,
  sourceLabelmap: LabelmapLayer
): LabelmapLayer {
  const referencedImageIds =
    sourceLabelmap.referencedImageIds ?? sourceLabelmap.imageIds ?? [];
  const sourceImageIds = sourceLabelmap.imageIds ?? [];
  const sourceImage = sourceImageIds[0]
    ? cache.getImage(sourceImageIds[0])
    : null;
  const targetType =
    sourceImage?.voxelManager?.getConstructor?.().name ?? 'Uint8Array';

  const images = imageLoader.createAndCacheDerivedImages(referencedImageIds, {
    getDerivedImageId: (referencedImageId) =>
      `${segmentation.segmentationId}-storage-${csUtils.uuidv4()}-${referencedImageId.slice(-12)}`,
    targetBuffer: {
      type: targetType as Types.PixelDataTypedArrayString,
    },
  });

  return {
    labelmapId: `${segmentation.segmentationId}-storage-${csUtils.uuidv4()}`,
    storageKind: 'stack',
    imageIds: images.map((image) => image.imageId),
    referencedVolumeId: sourceLabelmap.referencedVolumeId,
    referencedImageIds,
    labelToSegmentIndex: {},
  };
}

function createPrivateLabelmap(
  segmentation: Segmentation,
  sourceLabelmap: LabelmapLayer
): LabelmapLayer {
  if (
    sourceLabelmap.imageIds?.length ||
    sourceLabelmap.referencedImageIds?.length
  ) {
    return createPrivateStackLabelmap(segmentation, sourceLabelmap);
  }

  if (sourceLabelmap.volumeId) {
    return createPrivateVolumeLabelmap(segmentation, sourceLabelmap);
  }

  return createPrivateStackLabelmap(segmentation, sourceLabelmap);
}

function moveSegmentToPrivateLabelmap(
  segmentation: Segmentation,
  segmentIndex: number,
  options: MoveSegmentToPrivateLabelmapOptions = {}
): LabelmapLayer | undefined {
  const binding = getSegmentBinding(segmentation, segmentIndex);
  if (!binding) {
    return;
  }

  const sourceLabelmap = getLabelmap(segmentation, binding.labelmapId);
  if (!sourceLabelmap) {
    return;
  }

  if (
    getSegmentsOnLabelmap(segmentation, sourceLabelmap.labelmapId).length <= 1
  ) {
    return sourceLabelmap;
  }

  const privateLabelmap = createPrivateLabelmap(segmentation, sourceLabelmap);
  registerLabelmap(segmentation, privateLabelmap);

  const movedVoxels: MovedVoxels[] = [];

  if (sourceLabelmap.volumeId && privateLabelmap.volumeId) {
    const sourceVolume = cache.getVolume(sourceLabelmap.volumeId);
    const targetVolume = cache.getVolume(privateLabelmap.volumeId);
    const indices: number[] = [];
    sourceVolume.voxelManager.forEach(({ value, index }) => {
      if (value !== binding.labelValue) {
        return;
      }

      targetVolume.voxelManager.setAtIndex(index, 1);
      sourceVolume.voxelManager.setAtIndex(index, 0);
      indices.push(index);
    });
    if (indices.length) {
      movedVoxels.push({
        source: sourceVolume.voxelManager as Types.IVoxelManager<number>,
        target: targetVolume.voxelManager as Types.IVoxelManager<number>,
        indices,
      });
    }
  } else {
    const sourceImageIds = sourceLabelmap.imageIds ?? [];
    const targetImageIds = privateLabelmap.imageIds ?? [];

    sourceImageIds.forEach((imageId, imageIndex) => {
      const sourceImage = cache.getImage(imageId);
      const targetImage = cache.getImage(targetImageIds[imageIndex]);

      if (!sourceImage || !targetImage) {
        return;
      }

      const indices: number[] = [];
      sourceImage.voxelManager.forEach(({ value, index }) => {
        if (value !== binding.labelValue) {
          return;
        }

        targetImage.voxelManager.setAtIndex(index, 1);
        sourceImage.voxelManager.setAtIndex(index, 0);
        indices.push(index);
      });
      if (indices.length) {
        movedVoxels.push({
          source: sourceImage.voxelManager as Types.IVoxelManager<number>,
          target: targetImage.voxelManager as Types.IVoxelManager<number>,
          indices,
        });
      }
    });
  }

  const previousBinding = { ...binding };
  const newBinding = {
    labelmapId: privateLabelmap.labelmapId,
    labelValue: 1,
  };

  setSegmentBinding(segmentation, segmentIndex, { ...newBinding });
  syncLegacyLabelmapData(segmentation);

  // Hand the caller an undo/redo step for the WHOLE move so it can be
  // recorded on the stroke's memo: without it, undo restores voxels but leaves
  // the private layer, its binding, and the bulk-moved voxels behind,
  // stranding the segment outside its history.
  options.moveStepCallback?.({
    undo: () => {
      for (const { source, target, indices } of movedVoxels) {
        for (const index of indices) {
          target.setAtIndex(index, 0);
          source.setAtIndex(index, previousBinding.labelValue);
        }
      }
      setSegmentBinding(segmentation, segmentIndex, { ...previousBinding });
      removeLabelmap(segmentation, privateLabelmap.labelmapId);
      syncLegacyLabelmapData(segmentation);
    },
    redo: () => {
      registerLabelmap(segmentation, privateLabelmap);
      for (const { source, target, indices } of movedVoxels) {
        for (const index of indices) {
          source.setAtIndex(index, 0);
          target.setAtIndex(index, 1);
        }
      }
      setSegmentBinding(segmentation, segmentIndex, { ...newBinding });
      syncLegacyLabelmapData(segmentation);
    },
  });

  return privateLabelmap;
}

export { createPrivateLabelmap, moveSegmentToPrivateLabelmap };
