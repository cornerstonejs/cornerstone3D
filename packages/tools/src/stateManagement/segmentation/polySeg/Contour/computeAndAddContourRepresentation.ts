import { SegmentationRepresentations } from '../../../../enums';
import { PolySegConversionOptions } from '../../../../types';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { computeContourData } from './contourComputationStrategies';
/**
 * Computes and adds the contour representation for a given segmentation.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param options - Optional parameters for computing the labelmap representation.
 * @param options.segmentIndices - An array of segment indices to include in the labelmap representation.
 * @param options.segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns A promise that resolves when the labelmap representation is computed and added.
 */
export function computeAndAddContourRepresentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  return computeAndAddRepresentation(
    segmentationId,
    SegmentationRepresentations.Contour,
    () => computeContourData(segmentationId, options),
    () => undefined
  );
}
