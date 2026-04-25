import { getEnabledElement, utilities } from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { removeVolumeLabelmapImageMapperActors } from './volumeLabelmapImageMapper';
import { getLabelmapRepresentationPrefix } from './labelmapRepresentationUID';

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
  removeVolumeLabelmapImageMapperActors(viewport, segmentationId);
  const actorUIDs =
    getLabelmapActorEntries(viewport.id, segmentationId)?.map(
      (actorEntry) => actorEntry.uid
    ) ?? [];

  if (actorUIDs.length) {
    const labelmapRepresentationPrefix =
      getLabelmapRepresentationPrefix(segmentationId);
    actorUIDs.forEach((actorUID) => {
      if (actorUID?.startsWith(labelmapRepresentationPrefix)) {
        utilities.viewportNextDataSetMetadataProvider.remove(actorUID);
      }
    });
    viewport.removeActors(actorUIDs);
  }
}

export default removeLabelmapFromElement;
