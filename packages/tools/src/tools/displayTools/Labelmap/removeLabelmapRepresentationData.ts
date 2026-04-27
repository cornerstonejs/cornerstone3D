import { utilities, type Types } from '@cornerstonejs/core';
import { isLabelmapRepresentationUID } from './labelmapRepresentationUID';

type ViewportWithDataRemoval = Types.IViewport & {
  removeData?: (dataId: string) => void;
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

  if (typeof dataViewport.removeData !== 'function') {
    return false;
  }

  utilities.viewportNextDataSetMetadataProvider.remove(representationUID);
  dataViewport.removeData(representationUID);

  return true;
}

export default removeLabelmapRepresentationData;
