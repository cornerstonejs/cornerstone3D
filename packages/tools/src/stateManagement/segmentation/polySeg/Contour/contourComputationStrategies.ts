import { cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getUniqueSegmentIndices } from '../../../../utilities/segmentation';
import {
  getSegmentation,
  setSegmentationRepresentationSpecificConfig,
} from '../../segmentationState';
import { PolySegConversionOptions } from '../../../../types';
import { computeSurfaceFromLabelmapSegmentation } from '../Surface/surfaceComputationStrategies';
import {
  SurfaceClipResult,
  clipAndCacheSurfacesForViewport,
} from '../../helpers/clipAndCacheSurfacesForViewport';
import { extractContourData } from './utils/extractContourData';
import { createAndAddContourSegmentationsFromClippedSurfaces } from './utils/createAndAddContourSegmentationsFromClippedSurfaces';
import { getToolGroupForViewport } from '../../../../store/ToolGroupManager';

// the map between segment index and the intersection points and lines
export type RawContourData = Map<number, SurfaceClipResult[]>;

/**
 * Computes contour data for a given segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - Optional parameters for the computation.
 * @returns An object containing the annotation UIDs map.
 * @throws Error if there is not enough data to convert to contour.
 */
export async function computeContourData(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  let rawContourData: RawContourData;
  const segmentation = getSegmentation(segmentationId);
  const representationData = segmentation.representationData;

  try {
    if (representationData.SURFACE) {
      rawContourData = await computeContourFromSurfaceSegmentation(
        segmentationId,
        {
          segmentIndices,
          ...options,
        }
      );
    } else if (representationData.LABELMAP) {
      rawContourData = await computeContourFromLabelmapSegmentation(
        segmentationId,
        {
          segmentIndices,
          ...options,
        }
      );
    }
  } catch (error) {
    console.error(error);
    throw error;
  }

  if (!rawContourData) {
    throw new Error(
      'Not enough data to convert to contour, currently only support converting volume labelmap to contour if available'
    );
  }

  const { viewport, segmentationRepresentationUID } = options;

  // create the new annotations and add them to the segmentation state representation
  // data for the contour representation
  const annotationUIDsMap = createAndAddContourSegmentationsFromClippedSurfaces(
    rawContourData,
    viewport,
    segmentationId
  );

  // make the segmentation configuration fillAlpha 0 since
  // we don't have proper hole support right now
  // Todo: add hole support
  const toolGroupId = getToolGroupForViewport(viewport.id)?.id;

  setSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    {
      CONTOUR: {
        fillAlpha: 0,
      },
    }
  );

  return {
    annotationUIDsMap,
  };
}

/**
 * Computes the contour from a labelmap segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - The options for the contour computation.
 * @returns The raw contour data.
 */
async function computeContourFromLabelmapSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
) {
  if (!options.viewport) {
    throw new Error('Viewport is required to compute contour from labelmap');
  }

  const results = await computeSurfaceFromLabelmapSegmentation(
    segmentationId,
    options
  );

  if (!results?.length) {
    console.error('Failed to convert labelmap to surface or labelmap is empty');
    return;
  }

  const { viewport, segmentationRepresentationUID } = options;

  const pointsAndPolys = results.map((surface) => {
    return {
      id: surface.segmentIndex.toString(),
      points: surface.data.points,
      polys: surface.data.polys,
      segmentIndex: surface.segmentIndex,
    };
  });

  const polyDataCache = await clipAndCacheSurfacesForViewport(
    pointsAndPolys,
    viewport as Types.IVolumeViewport,
    segmentationRepresentationUID
  );

  const rawResults = extractContourData(polyDataCache);

  return rawResults;
}

/**
 * Computes the contour from a surface segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - The options for the contour computation.
 * @returns A promise that resolves to the raw contour data.
 * @throws An error if the viewport is not provided.
 */
async function computeContourFromSurfaceSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
): Promise<RawContourData> {
  if (!options.viewport) {
    throw new Error('Viewport is required to compute contour from surface');
  }
  const { viewport, segmentationRepresentationUID } = options;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  const segmentIndexToSurfaceId = new Map() as Map<number, string>;
  const surfaceIdToSegmentIndex = new Map() as Map<string, number>;

  const segmentation = getSegmentation(segmentationId);
  const representationData = segmentation.representationData.SURFACE;

  const surfacesInfo = [];
  representationData.geometryIds.forEach((geometryId, segmentIndex) => {
    if (segmentIndices.includes(segmentIndex)) {
      segmentIndexToSurfaceId.set(segmentIndex, geometryId);
      const surface = cache.getGeometry(geometryId)?.data as Types.ISurface;
      if (surface) {
        surfacesInfo.push({
          id: geometryId,
          points: surface.getPoints(),
          polys: surface.getPolys(),
        });
      }
    }
  });

  segmentIndexToSurfaceId.forEach((surfaceId, segmentIndex) => {
    surfaceIdToSegmentIndex.set(surfaceId, segmentIndex);
  });

  const polyDataCache = await clipAndCacheSurfacesForViewport(
    surfacesInfo,
    viewport as Types.IVolumeViewport,
    segmentationRepresentationUID
  );

  const rawResults = extractContourData(polyDataCache, surfaceIdToSegmentIndex);

  return rawResults;
}

export { computeContourFromLabelmapSegmentation };
