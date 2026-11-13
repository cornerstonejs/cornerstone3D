import { cache } from '@cornerstonejs/core';
import { getSegmentations } from '../../stateManagement/segmentation/getSegmentations';
import { getLabelmaps } from '../../stateManagement/segmentation/labelmapModel/labelmapLayerStore';
import { syncDynamicLabelmapVolume } from '../../stateManagement/segmentation/labelmapModel/dynamicLabelmapVolume';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

/**
 * Listens to the core DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED event, and moves
 * each 4D labelmap to the time point that the image volume now shows.
 */
const dynamicVolumeDimensionGroupChangedListener = function (
  evt: CustomEvent
): void {
  const imageVolume = cache.getVolume(evt.detail?.volumeId);

  if (!imageVolume) {
    return;
  }

  getSegmentations().forEach((segmentation) => {
    const changed = getLabelmaps(segmentation).filter((layer) => {
      const labelmapVolume = cache.getVolume(
        layer.volumeId ?? layer.geometryVolumeId
      );

      return (
        labelmapVolume && syncDynamicLabelmapVolume(labelmapVolume, imageVolume)
      );
    });

    if (changed.length) {
      triggerSegmentationDataModified(segmentation.segmentationId);
    }
  });
};

export default dynamicVolumeDimensionGroupChangedListener;
