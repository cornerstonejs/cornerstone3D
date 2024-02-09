import { SegmentationRepresentations } from '../../../../enums';
import { PolySegConversionOptions } from '../../../../types';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { computeSurfaceData } from './surfaceComputationStrategies';
import { updateSurfaceData } from './updateSurfaceData';

/**
 * Computes and adds a surface representation for a given segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - Additional options for computing the surface representation.
 * @param options.segmentIndices - The indices of the segments to compute the surface for.
 * @param options.segmentationRepresentationUID - The UID of the segmentation representation to compute the surface for.
 *
 * @returns A promise that resolves when the surface representation is computed and added.
 */
export function computeAndAddSurfaceRepresentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  return computeAndAddRepresentation(
    segmentationId,
    SegmentationRepresentations.Surface,
    () => computeSurfaceData(segmentationId, options),
    () => updateSurfaceData(segmentationId)
  );
}
