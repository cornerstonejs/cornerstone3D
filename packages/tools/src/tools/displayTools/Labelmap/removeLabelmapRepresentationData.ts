import { displaySetRegistry, type Types } from '@cornerstonejs/core';
import { isLabelmapRepresentationUID } from './labelmapRepresentationUID';

type ViewportWithDataRemoval = Types.IViewport & {
  removeDisplaySet?: (displaySetId: string) => void;
};

function removeLabelmapRepresentationData(
  viewport: Types.IViewport,
  segmentationId: string,
  actorEntry: Types.ActorEntry
): boolean {
  const representationUID = actorEntry.representationUID;

  if (!isLabelmapRepresentationUID(representationUID, segmentationId)) {
    return false;
  }

  const dataViewport = viewport as ViewportWithDataRemoval;

  if (typeof dataViewport.removeDisplaySet !== 'function') {
    return false;
  }

  displaySetRegistry.remove(representationUID);
  dataViewport.removeDisplaySet(representationUID);

  return true;
}

export default removeLabelmapRepresentationData;
