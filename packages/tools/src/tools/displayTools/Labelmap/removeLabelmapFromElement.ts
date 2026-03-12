import { getEnabledElement, VolumeViewport } from '@cornerstonejs/core';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { getLabelmapActorUID } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

/**
 * Remove the labelmap segmentation representation from the viewport's HTML Element.
 * NOTE: This function should not be called directly.
 *
 * @param element - The element that the segmentation is being added to.
 * @param segmentationId - The id of the segmentation to remove.
 *
 * @internal
 */
function removeLabelmapFromElement(
  element: HTMLDivElement,
  segmentationId: string
): void {
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  if (viewport instanceof VolumeViewport && viewport.useCPURendering) {
    const segmentation = getSegmentation(segmentationId);
    const volumeId = (
      segmentation?.representationData?.Labelmap as { volumeId?: string }
    )?.volumeId;

    if (volumeId) {
      (
        viewport as unknown as {
          removeCPUVolumes?: (volumeIds: string[]) => void;
        }
      ).removeCPUVolumes?.([volumeId]);
    }

    return;
  }

  const actorUID = getLabelmapActorUID(viewport.id, segmentationId);
  if (actorUID) {
    viewport.removeActors([actorUID]);
  }
}

export default removeLabelmapFromElement;
