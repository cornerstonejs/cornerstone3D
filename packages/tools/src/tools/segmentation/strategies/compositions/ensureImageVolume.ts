import { cache, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import type { LabelmapSegmentationDataStack } from '../../../../types';
import getOrCreateImageVolume from '../../../../utilities/segmentation/getOrCreateImageVolume';
import { getOrCreateDynamicLabelmapVolume } from '../../../../stateManagement/segmentation/labelmapModel';
import { syncDynamicLabelmapVolumeToImageId } from '../../../../stateManagement/segmentation/labelmapModel/dynamicLabelmapVolume';

/**
 * Gets the dynamic image volume that holds the referenced images, when that
 * volume shows the time point of the labelmap, or when the labelmap is a 3D
 * labelmap that all time points share. A shared labelmap then reads the
 * values of the time point on display.
 */
function getDynamicImageVolume(
  referencedImageIds: string[],
  isDynamicLabelmap: boolean
): Types.IImageVolume | undefined {
  const volume = cache.getVolumeContainingImageId(referencedImageIds[0])
    ?.volume as
    | (Types.IDynamicImageVolume & {
        getCurrentDimensionGroupImageIds: () => string[];
      })
    | undefined;

  if (!volume?.isDynamicVolume?.()) {
    return;
  }

  if (
    !isDynamicLabelmap ||
    volume.getCurrentDimensionGroupImageIds().includes(referencedImageIds[0])
  ) {
    return volume;
  }
}

export default {
  [StrategyCallbacks.EnsureImageVolumeFor3DManipulation]: (data) => {
    const { operationData, viewport } = data;
    const segmentation = getSegmentation(operationData.segmentationId);
    const dynamicLabelmapVolume =
      getOrCreateDynamicLabelmapVolume(segmentation);

    let referencedImageIds;
    if (dynamicLabelmapVolume) {
      // A 4D labelmap: the images of the time point that it shows.
      if (viewport) {
        syncDynamicLabelmapVolumeToImageId(
          dynamicLabelmapVolume,
          viewport.getCurrentImageId()
        );
      }
      referencedImageIds = dynamicLabelmapVolume.referencedImageIds;
    } else if (viewport) {
      referencedImageIds = viewport.getImageIds();
      const isValidVolumeForSphere = csUtils.isValidVolume(referencedImageIds);
      if (!isValidVolumeForSphere) {
        throw new Error(
          'Volume is not reconstructable for sphere manipulation'
        );
      }
    } else {
      const imageIds = (
        segmentation.representationData
          .Labelmap as LabelmapSegmentationDataStack
      ).imageIds;

      referencedImageIds = imageIds.map((imageId) => {
        const image = cache.getImage(imageId);
        return image.referencedImageId;
      });
    }

    const imageVolume =
      (viewport && !dynamicLabelmapVolume
        ? undefined
        : getDynamicImageVolume(
            referencedImageIds,
            Boolean(dynamicLabelmapVolume)
          )) ?? getOrCreateImageVolume(referencedImageIds);

    if (!imageVolume) {
      throw new Error('Failed to create or get image volume');
    }

    operationData.imageVoxelManager = imageVolume.voxelManager;
    operationData.imageData = imageVolume.imageData;
  },
};
