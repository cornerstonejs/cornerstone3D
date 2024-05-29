import { SegmentationRepresentations } from '../../../../enums/index.js';
import { PolySegConversionOptions } from '../../../../types/index.js';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation.js';
import { computeSurfaceData } from './surfaceComputationStrategies.js';
import { updateSurfaceData } from './updateSurfaceData.js';

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
