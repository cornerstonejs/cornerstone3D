import { cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import type {
  LabelmapSegmentationData,
  LabelmapLayer,
} from '../../../types/LabelmapTypes';
import { ensureLabelmapState } from './normalizeLabelmapSegmentationData';

function getLabelmap(
  segmentation: Segmentation,
  labelmapId: string
): LabelmapLayer | undefined {
  return ensureLabelmapState(segmentation)?.labelmaps?.[labelmapId];
}

function getLabelmaps(segmentation: Segmentation): LabelmapLayer[] {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return [];
  }

  return Object.values(labelmapState.labelmaps);
}

function registerLabelmap(
  segmentation: Segmentation,
  layer: LabelmapLayer
): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  labelmapState.labelmaps[layer.labelmapId] = layer;
}

function removeLabelmap(segmentation: Segmentation, labelmapId: string): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  const layer = labelmapState.labelmaps[labelmapId];
  if (layer?.geometryVolumeId && cache.getVolume(layer.geometryVolumeId)) {
    cache.removeVolumeLoadObject(layer.geometryVolumeId);
  }

  delete labelmapState.labelmaps[labelmapId];
}

function getOrCreateLabelmapVolume(
  layer: LabelmapLayer
): Types.IImageVolume | undefined {
  const existingVolumeId = layer.volumeId ?? layer.geometryVolumeId;

  if (existingVolumeId) {
    const cachedVolume = cache.getVolume(existingVolumeId);

    if (cachedVolume) {
      return cachedVolume as Types.IImageVolume;
    }
  }

  const imageIds = layer.imageIds ?? [];

  if (!imageIds.length) {
    return;
  }

  const volumeId =
    layer.volumeId ?? layer.geometryVolumeId ?? `${layer.labelmapId}-geometry`;

  if (!layer.volumeId) {
    layer.geometryVolumeId = volumeId;
  }

  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return cachedVolume as Types.IImageVolume;
  }

  return volumeLoader.createAndCacheVolumeFromImagesSync(volumeId, imageIds);
}

function getLabelmapIds(segmentation: Segmentation): string[] {
  return getLabelmaps(segmentation).map((layer) => layer.labelmapId);
}

function getLabelmapDataById(
  segmentation: Segmentation,
  labelmapId: string
): LabelmapSegmentationData | undefined {
  const labelmapState = ensureLabelmapState(segmentation);
  const layer = labelmapState?.labelmaps?.[labelmapId];
  if (!labelmapState || !layer) {
    return;
  }

  return {
    volumeId: layer.volumeId,
    referencedVolumeId: layer.referencedVolumeId,
    imageIds: layer.imageIds,
    referencedImageIds: layer.referencedImageIds,
    sourceRepresentationName: labelmapState.sourceRepresentationName,
    labelmaps: {
      [labelmapId]: layer,
    },
    segmentBindings: Object.fromEntries(
      Object.entries(labelmapState.segmentBindings).filter(
        ([, binding]) => binding.labelmapId === labelmapId
      )
    ),
  };
}

function getScalarArrayLengthFromLabelmap(layer: LabelmapLayer): number {
  if (layer.volumeId) {
    return cache.getVolume(layer.volumeId)?.voxelManager?.getScalarDataLength();
  }

  const firstImageId = layer.imageIds?.[0];
  const firstImage = firstImageId ? cache.getImage(firstImageId) : null;
  if (!firstImage || !layer.imageIds?.length) {
    return 0;
  }

  return firstImage.voxelManager.getScalarDataLength() * layer.imageIds.length;
}

function getConstructorNameForLabelmap(layer: LabelmapLayer): string {
  if (layer.volumeId) {
    return cache.getVolume(layer.volumeId)?.voxelManager?.getConstructor()
      ?.name;
  }

  const imageId = layer.imageIds?.[0];
  return imageId
    ? cache.getImage(imageId)?.voxelManager?.getConstructor()?.name
    : undefined;
}

function getLabelmapForImageId(
  segmentation: Segmentation,
  imageId: string
): LabelmapLayer | undefined {
  return getLabelmaps(segmentation).find((layer) =>
    layer.imageIds?.includes(imageId)
  );
}

function getLabelmapForVolumeId(
  segmentation: Segmentation,
  volumeId: string
): LabelmapLayer | undefined {
  return getLabelmaps(segmentation).find(
    (layer) =>
      layer.volumeId === volumeId || layer.geometryVolumeId === volumeId
  );
}

export {
  getConstructorNameForLabelmap,
  getLabelmap,
  getLabelmapDataById,
  getLabelmapForImageId,
  getLabelmapForVolumeId,
  getLabelmapIds,
  getLabelmaps,
  getOrCreateLabelmapVolume,
  getScalarArrayLengthFromLabelmap,
  registerLabelmap,
  removeLabelmap,
};
