import { BaseVolumeViewport, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  getLabelmapForSegment,
  getOrCreateLabelmapVolume,
  getSegmentBinding,
  getSegmentIndexForLabelValue,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';

function collectCrossLayerEraseBindings(
  operationData: InitializedOperationData
): void {
  const { segmentationId, labelmapId, overwriteSegmentIndices } = operationData;
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

export { collectCrossLayerEraseBindings, eraseCrossLayerOverwrites };
