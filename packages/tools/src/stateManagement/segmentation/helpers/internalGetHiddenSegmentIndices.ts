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

  return (representation.segmentsHidden ?? new Set()) as Set<number>;
}
