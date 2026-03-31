import { BaseVolumeViewport, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getConfig } from '../../../../config';
import { getSegmentationRepresentation } from '../../../../stateManagement/segmentation/getSegmentationRepresentation';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  getLabelmap,
  getLabelValueForSegment,
  getOrCreateLabelmapVolume,
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentsOnLabelmap,
  getLabelmapForSegment,
  moveSegmentToPrivateLabelmap,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';
import { SegmentationRepresentations } from '../../../../enums';

function resolveOverwriteSegmentIndices(
  operationData: InitializedOperationData
): number[] {
  const { segmentationId, segmentIndex, segmentsLocked, viewport } =
    operationData;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation || segmentIndex === 0) {
    return [];
  }

  const overwriteMode = getConfig().segmentation?.overwriteMode ?? 'all';
  if (overwriteMode === 'none') {
    return [];
  }

  const allSegmentIndices = Object.keys(segmentation.segments)
    .map(Number)
    .filter(
      (candidateSegmentIndex) =>
        candidateSegmentIndex !== segmentIndex &&
        !segmentsLocked.includes(candidateSegmentIndex)
    );

  if (overwriteMode === 'all') {
    return allSegmentIndices;
  }

  const representation = getSegmentationRepresentation(viewport.id, {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  });

  if (!representation?.visible) {
    return [];
  }

  return allSegmentIndices.filter(
    (candidateSegmentIndex) =>
      representation.segments[candidateSegmentIndex]?.visible !== false
  );
}

function separateIfNeeded(operationData: InitializedOperationData): void {
  const { segmentationId, segmentIndex, segmentationVoxelManager } =
    operationData;

  if (!segmentIndex) {
    return;
  }

  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    return;
  }

  const binding = getSegmentBinding(segmentation, segmentIndex);
  if (!binding) {
    return;
  }

  const sourceLayer = getLabelmap(segmentation, binding.labelmapId);
  if (!sourceLayer) {
    return;
  }

  const protectedSegmentIndices = getSegmentsOnLabelmap(
    segmentation,
    binding.labelmapId
  ).filter(
    (candidateSegmentIndex) =>
      candidateSegmentIndex !== segmentIndex &&
      !operationData.overwriteSegmentIndices.includes(candidateSegmentIndex)
  );

  if (!protectedSegmentIndices.length) {
    return;
  }

  const protectedSet = new Set(protectedSegmentIndices);
  let hasConflict = false;

  segmentationVoxelManager.forEach(
    ({ value }) => {
      if (!value || hasConflict) {
        return;
      }

      const candidateSegmentIndex = getSegmentIndexForLabelValue(
        segmentation,
        binding.labelmapId,
        Number(value)
      );

      if (candidateSegmentIndex && protectedSet.has(candidateSegmentIndex)) {
        hasConflict = true;
      }
    },
    {
      imageData: operationData.segmentationImageData,
      isInObject: operationData.isInObject,
      boundsIJK: operationData.isInObjectBoundsIJK,
    }
  );

  if (!hasConflict) {
    return;
  }

  const privateLabelmap = moveSegmentToPrivateLabelmap(
    segmentation,
    segmentIndex
  );
  if (!privateLabelmap) {
    return;
  }

  operationData.labelmapId = privateLabelmap.labelmapId;
  operationData.labelValue = 1;

  const stackViewport = operationData.viewport as Types.IStackViewport;
  const currentImageId =
    operationData.imageId ||
    (typeof stackViewport.getCurrentImageId === 'function'
      ? stackViewport.getCurrentImageId()
      : undefined);
  const sourceImageIds = sourceLayer.imageIds ?? [];
  const currentIndex = currentImageId
    ? sourceImageIds.indexOf(currentImageId)
    : -1;
  const fallbackIndex =
    currentIndex === -1 && currentImageId
      ? stackViewport.getImageIds?.().indexOf(currentImageId)
      : -1;
  const targetIndex =
    currentIndex >= 0 ? currentIndex : fallbackIndex >= 0 ? fallbackIndex : -1;

  if (operationData.viewport instanceof BaseVolumeViewport) {
    const targetImageId =
      targetIndex >= 0
        ? privateLabelmap.imageIds?.[targetIndex]
        : privateLabelmap.imageIds?.[0];
    if (targetImageId) {
      operationData.imageId = targetImageId;
    }

    const privateVolume = getOrCreateLabelmapVolume(privateLabelmap);
    if (!privateVolume) {
      return;
    }

    operationData.segmentationImageData = privateVolume?.imageData;
    operationData.segmentationVoxelManager =
      privateVolume?.voxelManager as Types.IVoxelManager<number>;
    return;
  }

  const targetImageId =
    targetIndex >= 0
      ? privateLabelmap.imageIds?.[targetIndex]
      : privateLabelmap.imageIds?.[0];

  if (targetImageId) {
    operationData.imageId = targetImageId;
    operationData.segmentationVoxelManager = cache.getImage(targetImageId)
      ?.voxelManager as Types.IVoxelManager<number>;
  }
}

function collectCrossLayerEraseBindings(
  operationData: InitializedOperationData
): void {
  const { segmentationId, segmentIndex, labelmapId, overwriteSegmentIndices } =
    operationData;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation || !overwriteSegmentIndices?.length) {
    operationData.crossLayerEraseBindings = [];
    return;
  }

  const eraseBindings = overwriteSegmentIndices
    .map((overwriteSegmentIndex) => ({
      overwriteSegmentIndex,
      binding: getSegmentBinding(segmentation, overwriteSegmentIndex),
    }))
    .filter((entry) => entry.binding && entry.binding.labelmapId !== labelmapId)
    .map((entry) => entry.binding);

  operationData.crossLayerEraseBindings = eraseBindings;
}

function prepareOverlapOperationData(
  operationData: InitializedOperationData
): void {
  const segmentation = getSegmentation(operationData.segmentationId);
  if (!segmentation) {
    return;
  }

  operationData.labelValue = operationData.segmentIndex
    ? getLabelValueForSegment(segmentation, operationData.segmentIndex)
    : 0;
  operationData.labelmapId =
    operationData.segmentIndex > 0
      ? getLabelmapForSegment(segmentation, operationData.segmentIndex)
          ?.labelmapId
      : undefined;
  operationData.overwriteSegmentIndices =
    resolveOverwriteSegmentIndices(operationData);

  if (operationData.segmentIndex > 0) {
    separateIfNeeded(operationData);
  }

  collectCrossLayerEraseBindings(operationData);
}

function eraseCrossLayerOverwrites(
  operationData: InitializedOperationData
): number[] {
  const { crossLayerEraseBindings, segmentationId } = operationData;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation || !crossLayerEraseBindings?.length) {
    return [];
  }

  const modifiedSlices = new Set<number>();

  crossLayerEraseBindings.forEach((binding) => {
    const layer = getLabelmapForSegment(
      segmentation,
      getSegmentIndexForLabelValue(
        segmentation,
        binding.labelmapId,
        binding.labelValue
      )
    );

    if (!layer) {
      return;
    }

    if (
      operationData.viewport instanceof BaseVolumeViewport ||
      layer.volumeId
    ) {
      const volume = getOrCreateLabelmapVolume(layer);
      volume?.voxelManager.forEach(
        ({ value, index, pointIJK }) => {
          if (value !== binding.labelValue) {
            return;
          }

          const worldPoint = volume.imageData.indexToWorld(
            pointIJK as Types.Point3
          ) as Types.Point3;
          if (!operationData.isInObject(worldPoint)) {
            return;
          }

          volume.voxelManager.setAtIndex(index, 0);
        },
        {
          imageData: volume?.imageData,
          boundsIJK: operationData.isInObjectBoundsIJK,
        }
      );
      volume?.voxelManager
        ?.getArrayOfModifiedSlices?.()
        ?.forEach((sliceIndex) => modifiedSlices.add(sliceIndex));
      return;
    }

    const stackViewport = operationData.viewport as Types.IStackViewport;
    const currentImageId =
      (typeof stackViewport.getCurrentImageId === 'function'
        ? stackViewport.getCurrentImageId()
        : undefined) ?? operationData.imageId;
    const currentIndex = currentImageId
      ? stackViewport.getImageIds().indexOf(currentImageId)
      : -1;
    const imageId =
      currentIndex >= 0 ? layer.imageIds?.[currentIndex] : layer.imageIds?.[0];
    const image = imageId ? cache.getImage(imageId) : null;

    if (!image) {
      return;
    }

    image.voxelManager.forEach(
      ({ value, index, pointIJK }) => {
        if (value !== binding.labelValue) {
          return;
        }

        const worldPoint = operationData.segmentationImageData.indexToWorld(
          pointIJK as Types.Point3
        ) as Types.Point3;
        if (!operationData.isInObject(worldPoint)) {
          return;
        }

        image.voxelManager.setAtIndex(index, 0);
      },
      {
        imageData: operationData.segmentationImageData,
        boundsIJK: operationData.isInObjectBoundsIJK,
      }
    );

    const currentSlice = operationData.viewport.getCurrentImageIdIndex?.();
    if (typeof currentSlice === 'number') {
      modifiedSlices.add(currentSlice);
    }
  });

  return Array.from(modifiedSlices);
}

export { eraseCrossLayerOverwrites, prepareOverlapOperationData };
