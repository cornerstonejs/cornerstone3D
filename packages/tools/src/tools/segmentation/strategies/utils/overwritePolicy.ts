import { getConfig } from '../../../../config';
import { SegmentationRepresentations } from '../../../../enums';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import { getSegmentationRepresentation } from '../../../../stateManagement/segmentation/getSegmentationRepresentation';
import type { InitializedOperationData } from '../BrushStrategy';

function resolveOverwriteSegmentIndices(
  operationData: InitializedOperationData
): number[] {
  const { segmentationId, segmentIndex, segmentsLocked, viewport } =
    operationData;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation || segmentIndex === 0) {
    return [];
  }

  const overwriteMode = getConfig().segmentation?.overwriteMode ?? 'all';
  if (overwriteMode === 'none') {
    return [];
  }

  const allSegmentIndices = Object.keys(segmentation.segments)
    .map(Number)
    .filter(
      (candidateSegmentIndex) =>
        candidateSegmentIndex !== segmentIndex &&
        !segmentsLocked.includes(candidateSegmentIndex)
    );

  if (overwriteMode === 'all') {
    return allSegmentIndices;
  }

  const representation = getSegmentationRepresentation(viewport.id, {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  });

  if (!representation?.visible) {
    return [];
  }

  return allSegmentIndices.filter(
    (candidateSegmentIndex) =>
      representation.segments[candidateSegmentIndex]?.visible !== false
  );
}

export { resolveOverwriteSegmentIndices };
