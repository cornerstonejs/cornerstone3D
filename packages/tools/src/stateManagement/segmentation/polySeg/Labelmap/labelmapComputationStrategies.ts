import { VolumeViewport, volumeLoader, imageLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getUniqueSegmentIndices } from '../../../../utilities/segmentation/getUniqueSegmentIndices';
import { getSegmentation } from '../../getSegmentation';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import {
  convertContourToStackLabelmap,
  convertContourToVolumeLabelmap,
} from './convertContourToLabelmap';
import { convertSurfaceToVolumeLabelmap } from './convertSurfaceToLabelmap';
import type { PolySegConversionOptions } from '../../../../types';
import { computeStackLabelmapFromVolume } from '../../helpers/computeStackLabelmapFromVolume';

export type RawLabelmapData =
  | LabelmapSegmentationDataVolume
  | LabelmapSegmentationDataStack;

export async function computeLabelmapData(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  let rawLabelmapData: RawLabelmapData;
  const segmentation = getSegmentation(segmentationId);
  const representationData = segmentation.representationData;

  try {
    if (representationData.Contour) {
      rawLabelmapData = await computeLabelmapFromContourSegmentation(
        segmentationId,
        {
          segmentIndices,
          ...options,
        }
      );
    } else if (representationData.Surface) {
      rawLabelmapData = await computeLabelmapFromSurfaceSegmentation(
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

  if (!rawLabelmapData) {
    throw new Error(
      'Not enough data to convert to surface, currently only support converting volume labelmap to surface if available'
    );
  }

  return rawLabelmapData;
}

async function computeLabelmapFromContourSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
  const isVolume = options.viewport instanceof VolumeViewport ?? true;

  if (isVolume && !options.viewport) {
    // Todo: we don't have support for volume viewport without providing the
    // viewport, since we need to get the referenced volumeId from the viewport
    // but we can alternatively provide the volumeId directly, or even better
    // the target metadata for the volume (spacing, origin, dimensions, etc.)
    // and then we can create the volume from that
    throw new Error(
      'Cannot compute labelmap from contour segmentation without providing the viewport'
    );
  }

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  const segmentation = getSegmentation(segmentationId);
  const representationData = segmentation.representationData.Contour;

  const convertFunction = isVolume
    ? convertContourToVolumeLabelmap
    : convertContourToStackLabelmap;

  const result = await convertFunction(representationData, {
    segmentIndices,
    viewport: options.viewport,
  });

  return result;
}

async function computeLabelmapFromSurfaceSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
  const { viewport } = options;
  const isVolume = viewport instanceof VolumeViewport ?? true;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  const segmentation = getSegmentation(segmentationId);

  const segmentsGeometryIds = new Map() as Map<number, string>;
  const representationData = segmentation.representationData.Surface;
  representationData.geometryIds.forEach((geometryId, segmentIndex) => {
    if (segmentIndices.includes(segmentIndex)) {
      segmentsGeometryIds.set(segmentIndex, geometryId);
    }
  });

  if (isVolume && !viewport) {
    // Todo: we don't have support for volume viewport without providing the
    // viewport, since we need to get the referenced volumeId from the viewport
    // but we can alternatively provide the volumeId directly, or even better
    // the target metadata for the volume (spacing, origin, dimensions, etc.)
    // and then we can create the volume from that
    throw new Error(
      'Cannot compute labelmap from surface segmentation without providing the viewport'
    );
  }

  let segmentationVolume;
  if (isVolume) {
    const volumeId = (viewport as Types.IVolumeViewport).getVolumeId();
    segmentationVolume =
      volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId);
  } else {
    const imageIds = (options.viewport as Types.IStackViewport).getImageIds();
    const segImages = imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

    const segImageIds = segImages.map((image) => image.imageId);

    segmentationVolume = await volumeLoader.createAndCacheVolumeFromImages(
      'generatedSegmentationVolumeId',
      segImageIds
    );
  }

  const result = await convertSurfaceToVolumeLabelmap(
    { geometryIds: segmentsGeometryIds },
    segmentationVolume
  );

  if (isVolume) {
    return result;
  }

  // we need to convert the volume labelmap to a stack labelmap
  const stackData = (await computeStackLabelmapFromVolume({
    volumeId: segmentationVolume.volumeId,
  })) as LabelmapSegmentationDataStack;

  return stackData;
}

export { computeLabelmapFromContourSegmentation };
