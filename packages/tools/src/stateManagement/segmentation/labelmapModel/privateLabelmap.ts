import {
  cache,
  imageLoader,
  utilities as csUtils,
  volumeLoader,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type { LabelmapLayer } from '../../../types/LabelmapTypes';
import { getLabelmap, registerLabelmap } from './labelmapLayerStore';
import {
  getSegmentBinding,
  getSegmentsOnLabelmap,
  setSegmentBinding,
} from './labelmapSegmentBindings';
import { syncLegacyLabelmapData } from './labelmapLegacyAdapter';

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
    type: 'volume',
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
    type: 'stack',
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
  segmentIndex: number
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

  if (sourceLabelmap.volumeId && privateLabelmap.volumeId) {
    const sourceVolume = cache.getVolume(sourceLabelmap.volumeId);
    const targetVolume = cache.getVolume(privateLabelmap.volumeId);
    sourceVolume.voxelManager.forEach(({ value, index }) => {
      if (value !== binding.labelValue) {
        return;
      }

      targetVolume.voxelManager.setAtIndex(index, 1);
      sourceVolume.voxelManager.setAtIndex(index, 0);
    });
  } else {
    const sourceImageIds = sourceLabelmap.imageIds ?? [];
    const targetImageIds = privateLabelmap.imageIds ?? [];

    sourceImageIds.forEach((imageId, imageIndex) => {
      const sourceImage = cache.getImage(imageId);
      const targetImage = cache.getImage(targetImageIds[imageIndex]);

      if (!sourceImage || !targetImage) {
        return;
      }

      sourceImage.voxelManager.forEach(({ value, index }) => {
        if (value !== binding.labelValue) {
          return;
        }

        targetImage.voxelManager.setAtIndex(index, 1);
        sourceImage.voxelManager.setAtIndex(index, 0);
      });
    });
  }

  setSegmentBinding(segmentation, segmentIndex, {
    labelmapId: privateLabelmap.labelmapId,
    labelValue: 1,
  });
  syncLegacyLabelmapData(segmentation);

  return privateLabelmap;
}

export { createPrivateLabelmap, moveSegmentToPrivateLabelmap };
