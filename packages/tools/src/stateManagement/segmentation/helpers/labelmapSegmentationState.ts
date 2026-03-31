import {
  cache,
  imageLoader,
  utilities as csUtils,
  volumeLoader,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type {
  Segmentation,
  Segment,
} from '../../../types/SegmentationStateTypes';
import type {
  LabelmapSegmentationData,
  LabelmapLayer,
  SegmentLabelmapBindingState,
} from '../../../types/LabelmapTypes';

const SOURCE_REPRESENTATION_NAME = 'binaryLabelmap';

type LabelmapSegmentationWithState = LabelmapSegmentationData & {
  labelmaps: {
    [labelmapId: string]: LabelmapLayer;
  };
  segmentBindings: {
    [segmentIndex: number]: SegmentLabelmapBindingState;
  };
};

function getSegmentOrder(segmentation: Segmentation): number[] {
  if (segmentation.segmentOrder?.length) {
    return [...segmentation.segmentOrder];
  }

  return Object.keys(segmentation.segments)
    .map(Number)
    .sort((a, b) => a - b);
}

function getPrimaryLabelmapId(segmentationId: string): string {
  return `${segmentationId}-storage-0`;
}

function getPrimaryLabelmapType(
  labelmapData: LabelmapSegmentationData
): 'volume' | 'stack' {
  return labelmapData.volumeId ? 'volume' : 'stack';
}

function ensureLabelmapState(
  segmentation: Segmentation
): LabelmapSegmentationWithState | undefined {
  const labelmapData = segmentation.representationData.Labelmap;

  if (!labelmapData) {
    return;
  }

  if (
    !labelmapData.labelmaps ||
    Object.keys(labelmapData.labelmaps).length === 0
  ) {
    const labelmapId = getPrimaryLabelmapId(segmentation.segmentationId);
    labelmapData.labelmaps = {
      [labelmapId]: {
        labelmapId,
        type: getPrimaryLabelmapType(labelmapData),
        volumeId: labelmapData.volumeId,
        referencedVolumeId: labelmapData.referencedVolumeId,
        referencedImageIds: labelmapData.referencedImageIds,
        imageIds: labelmapData.imageIds,
        labelToSegmentIndex: {},
      },
    };
  }

  if (!labelmapData.segmentBindings) {
    labelmapData.segmentBindings = {};
  }

  if (!labelmapData.sourceRepresentationName) {
    labelmapData.sourceRepresentationName = SOURCE_REPRESENTATION_NAME;
  }

  const labelmapIds = Object.keys(labelmapData.labelmaps);
  const fallbackLabelmapId =
    labelmapIds[0] ?? getPrimaryLabelmapId(segmentation.segmentationId);
  const layer =
    labelmapData.labelmaps[fallbackLabelmapId] ??
    (labelmapData.labelmaps[fallbackLabelmapId] = {
      labelmapId: fallbackLabelmapId,
      type: getPrimaryLabelmapType(labelmapData),
      volumeId: labelmapData.volumeId,
      referencedVolumeId: labelmapData.referencedVolumeId,
      referencedImageIds: labelmapData.referencedImageIds,
      imageIds: labelmapData.imageIds,
      labelToSegmentIndex: {},
    });

  const orderedSegmentIndices = getSegmentOrder(segmentation);
  orderedSegmentIndices.forEach((segmentIndex) => {
    if (!labelmapData.segmentBindings[segmentIndex]) {
      labelmapData.segmentBindings[segmentIndex] = {
        labelmapId: fallbackLabelmapId,
        labelValue: segmentIndex,
      };
    }
  });

  Object.entries(labelmapData.segmentBindings).forEach(
    ([segmentIndex, binding]) => {
      const layer = labelmapData.labelmaps[binding.labelmapId];
      if (!layer) {
        return;
      }

      layer.labelToSegmentIndex ||= {};
      layer.labelToSegmentIndex[binding.labelValue] = Number(segmentIndex);
    }
  );

  return labelmapData as LabelmapSegmentationWithState;
}

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

function getSegmentBinding(
  segmentation: Segmentation,
  segmentIndex: number
): SegmentLabelmapBindingState | undefined {
  return ensureLabelmapState(segmentation)?.segmentBindings?.[segmentIndex];
}

function setSegmentBinding(
  segmentation: Segmentation,
  segmentIndex: number,
  binding: SegmentLabelmapBindingState
): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  const previousBinding = labelmapState.segmentBindings[segmentIndex];
  if (previousBinding) {
    const previousLayer = labelmapState.labelmaps[previousBinding.labelmapId];
    if (previousLayer?.labelToSegmentIndex) {
      delete previousLayer.labelToSegmentIndex[previousBinding.labelValue];
    }
  }

  labelmapState.segmentBindings[segmentIndex] = binding;
  const layer = labelmapState.labelmaps[binding.labelmapId];
  if (layer) {
    layer.labelToSegmentIndex ||= {};
    layer.labelToSegmentIndex[binding.labelValue] = segmentIndex;
  }
}

function getSegmentsOnLabelmap(
  segmentation: Segmentation,
  labelmapId: string
): number[] {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return [];
  }

  return Object.entries(labelmapState.segmentBindings)
    .filter(([, binding]) => binding.labelmapId === labelmapId)
    .map(([segmentIndex]) => Number(segmentIndex))
    .sort((a, b) => a - b);
}

function getSegmentIndexForLabelValue(
  segmentation: Segmentation,
  labelmapId: string,
  labelValue: number
): number | undefined {
  const layer = getLabelmap(segmentation, labelmapId);
  if (!layer || labelValue == null) {
    return;
  }

  return layer.labelToSegmentIndex?.[labelValue] ?? labelValue;
}

function getLabelValueForSegment(
  segmentation: Segmentation,
  segmentIndex: number
): number {
  return (
    getSegmentBinding(segmentation, segmentIndex)?.labelValue ?? segmentIndex
  );
}

function getLabelmapForSegment(
  segmentation: Segmentation,
  segmentIndex: number
): LabelmapLayer | undefined {
  const binding = getSegmentBinding(segmentation, segmentIndex);
  if (!binding) {
    return;
  }

  return getLabelmap(segmentation, binding.labelmapId);
}

function resolveLabelmapForSegment(
  segmentation: Segmentation,
  segmentIndex: number
): LabelmapLayer | undefined {
  return (
    getLabelmapForSegment(segmentation, segmentIndex) ??
    getLabelmaps(segmentation)[0]
  );
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

function syncLegacyLabelmapData(segmentation: Segmentation): void {
  const labelmapState = ensureLabelmapState(segmentation);
  if (!labelmapState) {
    return;
  }

  const primaryLabelmapId =
    getSegmentBinding(segmentation, getSegmentOrder(segmentation)[0] ?? 1)
      ?.labelmapId ?? Object.keys(labelmapState.labelmaps)[0];
  const primaryLayer = labelmapState.labelmaps[primaryLabelmapId];

  if (!primaryLayer) {
    return;
  }

  labelmapState.volumeId = primaryLayer.volumeId;
  labelmapState.referencedVolumeId = primaryLayer.referencedVolumeId;
  labelmapState.imageIds = primaryLayer.imageIds;
  labelmapState.referencedImageIds = primaryLayer.referencedImageIds;
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

function removeSegmentBinding(
  segmentation: Segmentation,
  segmentIndex: number
): void {
  const labelmapState = ensureLabelmapState(segmentation);
  const binding = labelmapState?.segmentBindings?.[segmentIndex];
  if (!labelmapState || !binding) {
    return;
  }

  const layer = labelmapState.labelmaps[binding.labelmapId];
  if (layer?.labelToSegmentIndex) {
    delete layer.labelToSegmentIndex[binding.labelValue];
  }

  delete labelmapState.segmentBindings[segmentIndex];

  if (getSegmentsOnLabelmap(segmentation, binding.labelmapId).length === 0) {
    removeLabelmap(segmentation, binding.labelmapId);
  }

  syncLegacyLabelmapData(segmentation);
}

function getReferencedImageIdToCurrentImageIdMap(
  segmentation: Segmentation
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  getLabelmaps(segmentation).forEach((layer) => {
    const referencedImageIds = layer.referencedImageIds ?? layer.imageIds ?? [];
    const imageIds = layer.imageIds ?? [];

    referencedImageIds.forEach((referenceImageId, index) => {
      if (!imageIds[index]) {
        return;
      }

      const values = map.get(referenceImageId) ?? [];
      if (!values.includes(imageIds[index])) {
        values.push(imageIds[index]);
      }
      map.set(referenceImageId, values);
    });
  });

  return map;
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
  SOURCE_REPRESENTATION_NAME,
  ensureLabelmapState,
  getConstructorNameForLabelmap,
  getLabelmapDataById,
  getLabelmap,
  getLabelmaps,
  getOrCreateLabelmapVolume,
  getLabelValueForSegment,
  getPrimaryLabelmapId,
  getReferencedImageIdToCurrentImageIdMap,
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentOrder,
  getSegmentsOnLabelmap,
  getLabelmapForImageId,
  getLabelmapForSegment,
  getLabelmapForVolumeId,
  resolveLabelmapForSegment,
  getLabelmapIds,
  moveSegmentToPrivateLabelmap,
  removeSegmentBinding,
  setSegmentBinding,
  syncLegacyLabelmapData,
};
