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

class SurfaceComputationStrategy {
  async compute(
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
}

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

const surfaceStrategy = new SurfaceComputationStrategy();
export { surfaceStrategy, computeSurfaceFromContourSegmentation };
