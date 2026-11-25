import type { Types } from '@cornerstonejs/core';
import type { PolySegConversionOptions } from '../types';
import * as cornerstoneTools from '@cornerstonejs/tools';

import { convertContourToSurface } from './convertContourToSurface';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';
import { convertLabelmapToSurfaces } from './convertLabelmapToSurface';
import type {
  Enums as ToolsEnums,
  Types as ToolsTypes,
} from '@cornerstonejs/tools';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.polySegLog.getLogger(
  'Surface.surfaceComputationStrategies'
);

const { getUniqueSegmentIndices } = cornerstoneTools.utilities.segmentation;
const { getSegmentation } = cornerstoneTools.segmentation.state;
const { SegmentationRepresentations } = cornerstoneTools.Enums;

export type RawSurfacesData = {
  segmentIndex: number;
  data: Types.SurfaceData;
}[];

/**
 * Computes surface data for a given segmentation.
 * A segment without voxels gets no surface and no entry in the geometry map:
 * an empty surface is not cached, as in `updateSurfaceData`, which adds the
 * surface of that segment once it has voxels.
 * @param segmentationId - The ID of the segmentation.
 * @param options - Additional options for surface computation.
 * @returns A promise that resolves to the computed surface data.
 * @throws An error if there is no surface data available for the segmentation,
 * or the error of the conversion, which the caller reports.
 */
export async function computeSurfaceData(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  let rawSurfacesData: RawSurfacesData;
  let source: ToolsEnums.SegmentationRepresentations;
  const segmentation = getSegmentation(segmentationId);
  const representationData = segmentation.representationData;

  if (representationData.Contour) {
    source = SegmentationRepresentations.Contour;
    rawSurfacesData = await computeSurfaceFromContourSegmentation(
      segmentationId,
      {
        segmentIndices,
        ...options,
      }
    );
  } else if (
    representationData.Labelmap as ToolsTypes.LabelmapSegmentationData
  ) {
    source = SegmentationRepresentations.Labelmap;
    // convert volume labelmap to surface
    rawSurfacesData = await computeSurfaceFromLabelmapSegmentation(
      segmentation.segmentationId,
      {
        segmentIndices,
        ...options,
      }
    );
  }

  if (!rawSurfacesData) {
    throw new Error(
      'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
    );
  }

  const surfacesData = await createAndCacheSurfacesFromRaw(
    segmentationId,
    rawSurfacesData.filter(({ data }) => data.points?.length),
    options,
    source
  );

  return surfacesData;
}

async function computeSurfaceFromLabelmapSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
): Promise<RawSurfacesData> {
  // Todo: validate valid labelmap representation
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation?.representationData?.Labelmap) {
    cs3dLogger.warn('Only support surface update from labelmaps');
    return;
  }

  const labelmapRepresentationData = segmentation.representationData.Labelmap;

  const segmentIndices =
    options.segmentIndices || getUniqueSegmentIndices(segmentationId);

  let surfaces: (Types.SurfaceData | undefined)[];
  try {
    surfaces = await convertLabelmapToSurfaces(
      labelmapRepresentationData,
      segmentIndices
    );
  } catch (error) {
    cs3dLogger.error(error);
    throw new Error('Failed to convert labelmap to surface');
  }

  // A segment with no result keeps its last surface.
  return surfaces
    .map((data, index) => ({ segmentIndex: segmentIndices[index], data }))
    .filter(({ data }) => data);
}

/**
 * Computes the surface from contour segmentation.
 * This may return an empty array in cases where the surface is currently empty
 * @param segmentationId - The ID of the segmentation.
 * @param options - The options for surface computation.
 * @returns A promise that resolves to the raw surfaces data.
 */
async function computeSurfaceFromContourSegmentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
): Promise<RawSurfacesData> {
  const segmentation = getSegmentation(segmentationId);

  const contourRepresentationData = segmentation.representationData.Contour;

  const segmentIndices =
    options.segmentIndices || getUniqueSegmentIndices(segmentationId);

  const promises = segmentIndices.map(async (index) => {
    const surface = await convertContourToSurface(
      contourRepresentationData as ToolsTypes.ContourSegmentationData,
      index
    );

    return { segmentIndex: index, data: surface };
  });

  const surfaces = await Promise.all(promises);
  const availableSurfaces = surfaces.filter((surface) => surface?.data);
  return availableSurfaces;
}

export {
  computeSurfaceFromContourSegmentation,
  computeSurfaceFromLabelmapSegmentation,
};
