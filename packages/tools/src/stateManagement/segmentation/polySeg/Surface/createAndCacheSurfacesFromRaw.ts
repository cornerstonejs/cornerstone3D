import type { Types } from '@cornerstonejs/core';
import { Enums, geometryLoader } from '@cornerstonejs/core';
import { getSegmentIndexColor } from '../../config/segmentationColor';
import type { RawSurfacesData } from './surfaceComputationStrategies';
import type { PolySegConversionOptions } from '../../../../types';
import type { SegmentationRepresentation } from '../../../../types/SegmentationStateTypes';
import { getSegmentationRepresentation } from '../../getSegmentationRepresentation';
import { getSegmentation } from '../../getSegmentation';

/**
 * Creates and caches surfaces from raw surface data.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param rawSurfacesData - The raw surface data.
 * @param options - Additional options for creating and caching surfaces.
 * @param options.segmentIndices - An array of segment indices.
 * @param options.segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns An object containing the IDs of the created surfaces.
 */
export async function createAndCacheSurfacesFromRaw(
  segmentationId: string,
  rawSurfacesData: RawSurfacesData,
  options: PolySegConversionOptions = {}
) {
  // Initialize segmentationRepresentation and toolGroupId if a representation UID is provided
  let segmentationRepresentation: SegmentationRepresentation;
  if (options.segmentationRepresentationUID) {
    segmentationRepresentation = getSegmentationRepresentation(
      options.segmentationRepresentationUID
    );
  }

  const segmentation = getSegmentation(segmentationId);

  const geometryIds = new Map<number, string>();

  // Loop through raw surfaces data and create surfaces
  const promises = Object.keys(rawSurfacesData).map(async (index: string) => {
    const rawSurfaceData = rawSurfacesData[index];
    const segmentIndex = rawSurfaceData.segmentIndex;

    // Get the color either from the segmentation representation or randomly generated
    const color = segmentationRepresentation;
    getSegmentIndexColor(
      segmentationRepresentation.segmentationRepresentationUID,
      segmentIndex
    ).slice(0, 3);

    if (!color) {
      throw new Error(
        'No color found for segment index, unable to create surface'
      );
    }

    const closedSurface = {
      id: `segmentation_${segmentation.segmentationId}_surface_${segmentIndex}`,
      color,
      frameOfReferenceUID: 'test-frameOfReferenceUID',
      data: {
        points: rawSurfaceData.data.points,
        polys: rawSurfaceData.data.polys,
      },
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
