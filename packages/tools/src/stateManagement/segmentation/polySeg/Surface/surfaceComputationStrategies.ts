import { Enums, Types, geometryLoader } from '@cornerstonejs/core';
import { ContourSegmentationData } from '../../../../types';
import { getUniqueSegmentIndices } from '../../../../utilities/segmentation';
import {
  findSegmentationRepresentationByUID,
  getSegmentation,
} from '../../segmentationState';
import { convertContourToSurface } from './convertContourToSurface';
import { getColorForSegmentIndex } from '../../config/segmentationColor';

type RawSurfacesData = { segmentIndex: number; data: Types.SurfaceData }[];

class SurfaceComputationStrategy {
  async compute(
    segmentationId: string,
    options: {
      segmentIndices?: number[];
      segmentationRepresentationUID?: string;
    }
  ) {
    try {
      const segmentation = getSegmentation(segmentationId);
      const representationData = segmentation.representationData;

      let rawSurfacesData;
      if (representationData.CONTOUR) {
        rawSurfacesData = await computeSurfaceFromContourSegmentation(
          segmentationId,
          options
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
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
  } = {}
): Promise<RawSurfacesData> {
  // Todo: validate valid labelmap representation
  const segmentation = getSegmentation(segmentationId);

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  const contourRepresentationData = segmentation.representationData.CONTOUR;

  const promises = segmentIndices.map(async (index) => {
    const surface = await convertContourToSurface(
      contourRepresentationData as ContourSegmentationData,
      index
    );

    return { segmentIndex: index, data: surface };
  });

  const surfaces = await Promise.all(promises);

  return surfaces;
}

async function createAndCacheSurfacesFromRaw(
  segmentationId: string,
  rawSurfacesData: RawSurfacesData,
  options: {
    segmentIndices?: number[];
    segmentationRepresentationUID?: string;
  } = {}
) {
  let segmentationRepresentation, toolGroupId;
  if (options.segmentationRepresentationUID) {
    ({ segmentationRepresentation, toolGroupId } =
      findSegmentationRepresentationByUID(
        options.segmentationRepresentationUID
      ));
  }

  const segmentation = getSegmentation(segmentationId);

  const geometryIds = [];
  const promises = Object.keys(rawSurfacesData).map((index) => {
    const rawSurfaceData = rawSurfacesData[index];
    const segmentIndex = rawSurfaceData.segmentIndex;

    let color;
    if (segmentationRepresentation) {
      color = getColorForSegmentIndex(
        toolGroupId,
        segmentationRepresentation.segmentationRepresentationUID,
        segmentIndex
      ).slice(0, 3);
    } else {
      color = [Math.random() * 255, Math.random() * 255, Math.random() * 255];
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

    geometryIds.push(closedSurface.id);

    const geometryId = closedSurface.id;
    return geometryLoader.createAndCacheGeometry(geometryId, {
      type: Enums.GeometryType.SURFACE,
      geometryData: closedSurface as Types.PublicSurfaceData,
    });
  });

  await Promise.all(promises);

  return {
    geometryIds,
  };
}

const surfaceStrategy = new SurfaceComputationStrategy();
export { surfaceStrategy, computeSurfaceFromContourSegmentation };
