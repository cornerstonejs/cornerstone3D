import type { SegmentationRepresentations } from '../../../enums';
import { getSegmentationRepresentation } from '../getSegmentationRepresentation';

export function internalGetHiddenSegmentIndices(
  viewportId,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
) {
  const representation = getSegmentationRepresentation(viewportId, specifier);

  if (!representation) {
    return new Set();
  }

  const segmentsHidden = Object.entries(representation.segments).reduce(
    (acc, [segmentIndex, segment]) => {
      if (!segment.visible) {
        acc.add(Number(segmentIndex));
      }
      return acc;
    },
    new Set<number>()
  );

  return segmentsHidden;
}
