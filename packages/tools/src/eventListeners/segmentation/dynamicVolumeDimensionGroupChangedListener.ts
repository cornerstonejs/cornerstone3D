import { utilities } from '@cornerstonejs/core';
import { triggerSegmentationRender } from '../../stateManagement/segmentation/SegmentationRenderingEngine';
import { getSegmentationRepresentations } from '../../stateManagement/segmentation/getSegmentationRepresentation';

/**
 * Listens to the core DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED event, fired when
 * a 4D volume shows another time point. A labelmap of a 4D source shows the
 * labelmap images of the current time point (see
 * getOrCreateDimensionGroupLabelmapVolume), so the segmentations of each
 * viewport that shows the volume render again.
 * @param evt - The DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED event object
 */
const dynamicVolumeDimensionGroupChangedListener = function (
  evt: CustomEvent
): void {
  const volumeId = evt.detail?.volumeId as string | undefined;
  if (!volumeId) {
    return;
  }

  utilities.getViewportsWithVolumeId(volumeId).forEach(({ id }) => {
    if (getSegmentationRepresentations(id)?.length) {
      triggerSegmentationRender(id);
    }
  });
};

export default dynamicVolumeDimensionGroupChangedListener;
