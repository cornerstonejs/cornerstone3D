import { SegmentationRepresentations } from '../../../../enums';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { surfaceStrategy } from './surfaceComputationStrategies';

export function computeAndAddSurfaceRepresentation(
  segmentationId: string,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
  } = {}
) {
  return computeAndAddRepresentation(
    segmentationId,
    SegmentationRepresentations.Surface,
    () => surfaceStrategy.compute(segmentationId, options),
    options
  );
}
