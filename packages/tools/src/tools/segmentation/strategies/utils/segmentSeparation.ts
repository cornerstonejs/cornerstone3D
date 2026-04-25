import { BaseVolumeViewport, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  getLabelmap,
  getOrCreateLabelmapVolume,
  getSegmentBinding,
  getSegmentIndexForLabelValue,
  getSegmentsOnLabelmap,
  moveSegmentToPrivateLabelmap,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';

function separateSegmentIfNeeded(
  operationData: InitializedOperationData
): void {
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

export { separateSegmentIfNeeded };
