import { getEnabledElement } from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { removeVolumeLabelmapImageMapperActors } from './volumeLabelmapImageMapper';
import removeLabelmapRepresentationData from './removeLabelmapRepresentationData';

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

  const labelmapActorEntries =
    getLabelmapActorEntries(viewport.id, segmentationId) ?? [];
  const legacyActorEntryUIDs: string[] = [];

  labelmapActorEntries.forEach((actorEntry) => {
    if (removeLabelmapRepresentationData(viewport, segmentationId, actorEntry)) {
      return;
    }

    legacyActorEntryUIDs.push(actorEntry.uid);
  });

  if (legacyActorEntryUIDs.length) {
    viewport.removeActors(legacyActorEntryUIDs);
  }
}

export default removeLabelmapFromElement;
