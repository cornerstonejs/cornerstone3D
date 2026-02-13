import type { Types } from '@cornerstonejs/core';
import { Enums, geometryLoader } from '@cornerstonejs/core';
import type { RawSurfacesData } from './surfaceComputationStrategies';
import type { PolySegConversionOptions } from '../types';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { getSegmentation } = cornerstoneTools.segmentation.state;
const { getSegmentIndexColor } = cornerstoneTools.segmentation.config.color;

/**
 * Creates and caches surfaces from raw surface data.
 *
 * @param segmentationId - The id of the segmentation
 * @param rawSurfacesData - The raw surface data
 * @param options - Optional parameters for creating and caching surfaces
 * @returns An object containing the IDs of the created surfaces
 */
export async function createAndCacheSurfacesFromRaw(
  segmentationId: string,
  rawSurfacesData: RawSurfacesData,
  options: PolySegConversionOptions = {}
) {
  // Initialize segmentationRepresentation and toolGroupId if a representation UID is provided

  const segmentation = getSegmentation(segmentationId);

  const geometryIds = new Map<number, string>();

  // Loop through raw surfaces data and create surfaces
  const promises = Object.keys(rawSurfacesData).map(async (index: string) => {
    const rawSurfaceData = rawSurfacesData[index];
    const segmentIndex = rawSurfaceData.segmentIndex;

    // Get the color either from the segmentation representation or randomly generated
    const color = getSegmentIndexColor(
      options.viewport.id,
      segmentation.segmentationId,
      segmentIndex
    ).slice(0, 3);

    if (!color) {
      throw new Error(
        'No color found for segment index, unable to create surface'
      );
    }

    if (!rawSurfaceData.data?.points) {
      throw new Error('No points found for surface');
    }
    const closedSurface = {
      id: `segmentation_${segmentation.segmentationId}_surface_${segmentIndex}`,
      color,
      frameOfReferenceUID: 'test-frameOfReferenceUID',
      points: rawSurfaceData.data.points,
      polys: rawSurfaceData.data.polys,
      segmentIndex,
    };

    const geometryId = closedSurface.id;
    geometryIds.set(segmentIndex, geometryId);

    return geometryLoader.createAndCacheGeometry(geometryId, {
      type: Enums.GeometryType.SURFACE,
      geometryData: closedSurface as unknown as Types.PublicSurfaceData,
    });
  });

  await Promise.all(promises);

  return {
    geometryIds,
  };
}
