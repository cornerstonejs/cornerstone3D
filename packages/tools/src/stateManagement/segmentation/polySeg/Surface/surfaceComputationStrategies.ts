import { Types } from '@cornerstonejs/core';
import { ContourSegmentationData } from '../../../../types';
import { getUniqueSegmentIndices } from '../../../../utilities/segmentation';
import { getSegmentation } from '../../segmentationState';
import { convertContourToSurface } from './convertContourToSurface';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';

export type RawSurfacesData = {
  segmentIndex: number;
  data: Types.SurfaceData;
}[];

/**
 * Computes surface data for a given segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - Additional options for surface computation.
 * @returns A promise that resolves to the computed surface data.
 * @throws An error if there is no surface data available for the segmentation.
 */
export async function computeSurfaceData(
  segmentationId: string,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
  }
) {
  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  try {
    const segmentation = getSegmentation(segmentationId);
    const representationData = segmentation.representationData;

    let rawSurfacesData;
    if (representationData.CONTOUR) {
      rawSurfacesData = await computeSurfaceFromContourSegmentation(
        segmentationId,
        {
          segmentIndices,
          ...options,
        }
      );
    } else {
      throw new Error(
        `No Surface data found for segmentationId ${segmentationId}.`
      );
    }

    if (!rawSurfacesData) {
      throw new Error(
        'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
      );
    }

    const surfacesData = await createAndCacheSurfacesFromRaw(
      segmentationId,
      rawSurfacesData,
      options
    );

    return surfacesData;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Computes the surface from contour segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - The options for surface computation.
 * @returns A promise that resolves to the raw surfaces data.
 */
async function computeSurfaceFromContourSegmentation(
  segmentationId: string,
  options: {
    segmentationRepresentationUID?: string;
    segmentIndices?: number[];
  } = {}
): Promise<RawSurfacesData> {
  const segmentation = getSegmentation(segmentationId);

  const contourRepresentationData = segmentation.representationData.CONTOUR;

  const promises = options.segmentIndices.map(async (index) => {
    const surface = await convertContourToSurface(
      contourRepresentationData as ContourSegmentationData,
      index
    );

    return { segmentIndex: index, data: surface };
  });

  const surfaces = await Promise.all(promises);

  return surfaces;
}

export { computeSurfaceFromContourSegmentation };
