import type { Types } from '@cornerstonejs/core';
import { getLabelmapActorEntries } from '../../../../stateManagement/segmentation/helpers/getSegmentationActor';
import removeLabelmapRepresentationData from '../removeLabelmapRepresentationData';

function removeLabelmapRepresentationFromViewport(
  viewport: Types.IViewport,
  segmentationId: string
): void {
  const labelmapActorEntries =
    getLabelmapActorEntries(viewport.id, segmentationId) ?? [];

  labelmapActorEntries.forEach((actorEntry) => {
    removeLabelmapRepresentationData(viewport, segmentationId, actorEntry);
  });
}

export { removeLabelmapRepresentationFromViewport };
