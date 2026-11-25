import type { Types } from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../../stateManagement/segmentation/helpers/getSegmentationActor';
import removeLabelmapRepresentationData from '../removeLabelmapRepresentationData';
import { removeVolumeLabelmapImageMapperActors } from '../volumeLabelmapImageMapper';

function removeLabelmapRepresentationFromViewport(
  viewport: Types.IViewport,
  segmentationId: string
): void {
  removeVolumeLabelmapImageMapperActors(viewport, segmentationId);

  const labelmapActorEntries =
    getLabelmapActorEntries(viewport.id, segmentationId) ?? [];
  const legacyActorEntryUIDs: string[] = [];

  labelmapActorEntries.forEach((actorEntry) => {
    if (
      removeLabelmapRepresentationData(viewport, segmentationId, actorEntry)
    ) {
      return;
    }

    legacyActorEntryUIDs.push(actorEntry.uid);
  });

  if (legacyActorEntryUIDs.length) {
    viewport.removeActors(legacyActorEntryUIDs);
  }
}

export { removeLabelmapRepresentationFromViewport };
