import { SegmentationRepresentations } from '../../../../enums';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { computeLabelmapData } from './labelmapComputationStrategies';
import { PolySegConversionOptions } from '../../../../types';

/**
 * Computes and adds the labelmap representation for a given segmentation.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param options - Optional parameters for computing the labelmap representation.
 * @param options.segmentIndices - An array of segment indices to include in the labelmap representation.
 * @param options.segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns A promise that resolves when the labelmap representation is computed and added.
 */
export function computeAndAddLabelmapRepresentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  return computeAndAddRepresentation(
    segmentationId,
    SegmentationRepresentations.Labelmap,
    () => computeLabelmapData(segmentationId, options),
    () => undefined
  );
}
