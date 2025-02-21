import * as cornerstoneTools from '@cornerstonejs/tools';

import type { PolySegConversionOptions } from '../types';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { computeSurfaceData } from './surfaceComputationStrategies';
import { updateSurfaceData } from './updateSurfaceData';

const { SegmentationRepresentations } = cornerstoneTools.Enums;
/**
 * Computes and adds a surface representation for a given segmentation.
 *
 * @param segmentationId - The id of the segmentation
 * @param options - Optional parameters for computing the surface representation
 * @returns A promise that resolves when the surface representation is computed and added
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
