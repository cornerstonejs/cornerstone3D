import type { PolySegConversionOptions } from '../types';
import { Enums } from '@cornerstonejs/tools';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { computeContourData } from './contourComputationStrategies';

const { SegmentationRepresentations } = Enums;

/**
 * Computes and adds the contour representation for a given segmentation.
 *
 * @param segmentationId - The id of the segmentation
 * @param options - Optional parameters for computing the contour representation
 * @returns A promise that resolves when the contour representation is computed and added
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
