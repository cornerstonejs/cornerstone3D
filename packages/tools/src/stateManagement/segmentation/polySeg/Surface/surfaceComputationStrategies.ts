import type { Types } from '@cornerstonejs/core';
import {
  ContourSegmentationData,
  PolySegConversionOptions,
} from '../../../../types';
import { getUniqueSegmentIndices } from '../../../../utilities/segmentation';
import { getSegmentation } from '../../segmentationState';
import { convertContourToSurface } from './convertContourToSurface';
import { createAndCacheSurfacesFromRaw } from './createAndCacheSurfacesFromRaw';
import {
  LabelmapSegmentationData,
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../../../tools/segmentation/strategies/utils/stackVolumeCheck';
import { convertLabelmapToSurface } from './convertLabelmapToSurface';

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
  options: PolySegConversionOptions = {}
) {
  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  let rawSurfacesData: RawSurfacesData;
  const segmentation = getSegmentation(segmentationId);
  const representationData = segmentation.representationData;

  try {
    if (representationData.CONTOUR) {
      rawSurfacesData = await computeSurfaceFromContourSegmentation(
        segmentationId,
        {
          segmentIndices,
          ...options,
        }
      );
    } else if (representationData.LABELMAP as LabelmapSegmentationData) {
      // convert volume labelmap to surface
      rawSurfacesData = await computeSurfaceFromLabelmapSegmentation(
        segmentation.segmentationId,
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
}

async function computeSurfaceFromLabelmapSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
): Promise<RawSurfacesData> {
  // Todo: validate valid labelmap representation
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation?.representationData?.LABELMAP) {
    console.warn('Only support surface update from labelmaps');
    return;
  }

  const isVolume = isVolumeSegmentation(
    segmentation.representationData.LABELMAP
  );

  const labelmapRepresentationData = segmentation.representationData.LABELMAP;

  const segmentIndices =
    options.segmentIndices || getUniqueSegmentIndices(segmentationId);

  const promises = segmentIndices.map((index) => {
    const surface = convertLabelmapToSurface(
      labelmapRepresentationData as
        | LabelmapSegmentationDataVolume
        | LabelmapSegmentationDataStack,
      index,
      isVolume
    );

    return surface;
  });

  const surfaces = await Promise.allSettled(promises);
  const errors = surfaces.filter((p) => p.status === 'rejected');

  if (errors.length > 0) {
    console.error(errors);
    throw new Error('Failed to convert labelmap to surface');
  }

  const rawSurfacesData = surfaces
    .map((surface, index) => {
      if (surface.status === 'fulfilled') {
        return { segmentIndex: segmentIndices[index], data: surface.value };
      }
    })
    .filter(Boolean);

  return rawSurfacesData;
}

/**
 * Computes the surface from contour segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @param options - The options for surface computation.
 * @returns A promise that resolves to the raw surfaces data.
 */
async function computeSurfaceFromContourSegmentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
): Promise<RawSurfacesData> {
  const segmentation = getSegmentation(segmentationId);

  const contourRepresentationData = segmentation.representationData.CONTOUR;

  const segmentIndices =
    options.segmentIndices || getUniqueSegmentIndices(segmentationId);

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

export {
  computeSurfaceFromContourSegmentation,
  computeSurfaceFromLabelmapSegmentation,
};
