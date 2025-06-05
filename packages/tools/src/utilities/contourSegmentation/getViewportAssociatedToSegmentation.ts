import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { getViewportIdsWithSegmentation } from '../../stateManagement/segmentation/getViewportIdsWithSegmentation';

export function getViewportAssociatedToSegmentation(segmentationId: string) {
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);
  if (viewportIds?.length === 0) {
    return;
  }
  const { viewport } = getEnabledElementByViewportId(viewportIds[0]) || {};
  return viewport;
}
