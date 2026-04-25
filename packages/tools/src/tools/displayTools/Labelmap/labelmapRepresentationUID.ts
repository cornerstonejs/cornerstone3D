import { SegmentationRepresentations } from '../../../enums';

function getLabelmapRepresentationPrefix(segmentationId: string): string {
  return `${segmentationId}-${SegmentationRepresentations.Labelmap}`;
}

function createLabelmapRepresentationUID({
  segmentationId,
  referencedId,
  sliceStateKey,
}: {
  segmentationId: string;
  referencedId?: string;
  sliceStateKey?: string;
}): string {
  return [
    getLabelmapRepresentationPrefix(segmentationId),
    referencedId,
    sliceStateKey,
  ]
    .filter(Boolean)
    .join('-');
}

function isLabelmapRepresentationUID(
  representationUID: unknown,
  segmentationId: string
): representationUID is string {
  return (
    typeof representationUID === 'string' &&
    representationUID.startsWith(
      getLabelmapRepresentationPrefix(segmentationId)
    )
  );
}

export {
  createLabelmapRepresentationUID,
  getLabelmapRepresentationPrefix,
  isLabelmapRepresentationUID,
};
