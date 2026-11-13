import { cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getSegmentations } from '../../stateManagement/segmentation/getSegmentations';
import { getLabelmaps } from '../../stateManagement/segmentation/labelmapModel/labelmapLayerStore';
import {
  isDynamicLabelmapVolume,
  syncDynamicLabelmapVolume,
} from '../../stateManagement/segmentation/labelmapModel/dynamicLabelmapVolume';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

/**
 * Listens to the core DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED event.
 *
 * A 4D labelmap moves to the time point that the image volume now shows. A 3D
 * labelmap over the images of the dynamic volume keeps its voxels, but its
 * statistics now use the new time point. Both get SEGMENTATION_DATA_MODIFIED
 * with the new `dimensionGroupNumber`; the 3D labelmap also gets
 * `voxelsUnchanged`.
 */
const dynamicVolumeDimensionGroupChangedListener = function (
  evt: CustomEvent
): void {
  const imageVolume = cache.getVolume(evt.detail?.volumeId);

  if (!imageVolume) {
    return;
  }

  const { dimensionGroupNumber } = imageVolume as Types.IDynamicImageVolume;

  getSegmentations().forEach((segmentation) => {
    let changed = false;
    let followsImageVolume = false;

    getLabelmaps(segmentation).forEach((layer) => {
      const labelmapVolumeId = layer.volumeId ?? layer.geometryVolumeId;
      const labelmapVolume =
        labelmapVolumeId && cache.getVolume(labelmapVolumeId);

      if (isDynamicLabelmapVolume(labelmapVolume)) {
        changed =
          syncDynamicLabelmapVolume(labelmapVolume, imageVolume) || changed;
        return;
      }

      const referencedImageId = cache.getImage(
        layer.imageIds?.[0]
      )?.referencedImageId;
      followsImageVolume ||=
        !!referencedImageId &&
        imageVolume.getImageURIIndex(
          utilities.imageIdToURI(referencedImageId)
        ) > -1;
    });

    if (changed || followsImageVolume) {
      triggerSegmentationDataModified(
        segmentation.segmentationId,
        undefined,
        undefined,
        { voxelsUnchanged: !changed, dimensionGroupNumber }
      );
    }
  });
};

export default dynamicVolumeDimensionGroupChangedListener;
