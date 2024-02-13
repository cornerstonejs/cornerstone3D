import { VolumeViewport, volumeLoader, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getUniqueSegmentIndices } from '../../../../utilities/segmentation';
import { getSegmentation } from '../../segmentationState';
import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../../../types/LabelmapTypes';
import {
  convertContourToStackLabelmap,
  convertContourToVolumeLabelmap,
} from './convertContourToLabelmap';
import { convertSurfaceToVolumeLabelmap } from './convertSurfaceToLabelmap';
import { computeStackSegmentationFromVolume } from '../../convertVolumeToStackSegmentation';
import { PolySegConversionOptions } from '../../../../types';

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
    if (representationData.CONTOUR) {
      rawLabelmapData = await computeLabelmapFromContourSegmentation(
        segmentationId,
        {
          segmentIndices,
          ...options,
        }
      );
    } else if (representationData.SURFACE) {
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
  const representationData = segmentation.representationData.CONTOUR;

  const convertFunction = isVolume
    ? convertContourToVolumeLabelmap
    : convertContourToStackLabelmap;

  const result = await convertFunction(representationData, {
    segmentIndices,
    segmentationRepresentationUID: options.segmentationRepresentationUID,
    viewport: options.viewport,
  });

  return result;
}

async function computeLabelmapFromSurfaceSegmentation(
  segmentationId,
  options: PolySegConversionOptions = {}
): Promise<LabelmapSegmentationDataVolume | LabelmapSegmentationDataStack> {
  const isVolume = options.viewport instanceof VolumeViewport ?? true;

  const segmentIndices = options.segmentIndices?.length
    ? options.segmentIndices
    : getUniqueSegmentIndices(segmentationId);

  const segmentation = getSegmentation(segmentationId);

  const segmentsGeometryIds = new Map() as Map<number, string>;
  const representationData = segmentation.representationData.SURFACE;
  representationData.geometryIds.forEach((geometryId, segmentIndex) => {
    if (segmentIndices.includes(segmentIndex)) {
      segmentsGeometryIds.set(segmentIndex, geometryId);
    }
  });

  if (isVolume && !options.viewport) {
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
    const defaultActor = options.viewport.getDefaultActor();
    const { uid: volumeId } = defaultActor;
    segmentationVolume =
      await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId);
  } else {
    // for stack we basically need to create a volume from the stack
    // imageIds and then create a segmentation volume from that and finally
    // convert the surface to a labelmap and later on convert the labelmap
    // to a stack labelmap
    const imageIds = (options.viewport as Types.IStackViewport).getImageIds();
    const volumeId = 'generatedSegmentationVolumeId';
    const volumeProps = utilities.generateVolumePropsFromImageIds(
      imageIds,
      volumeId
    );

    // we don't need the imageIds for the viewport (e.g., CT), but rather
    // want to use the imageIds as a reference
    delete volumeProps.imageIds;

    segmentationVolume = await volumeLoader.createLocalSegmentationVolume(
      {
        ...volumeProps,
        scalarData: volumeProps.scalarData as Types.PixelDataTypedArray,
        referencedImageIds: imageIds,
      },
      volumeId
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
  const stackData = (await computeStackSegmentationFromVolume({
    volumeId: segmentationVolume.volumeId,
  })) as LabelmapSegmentationDataStack;

  return stackData;
}

export { computeLabelmapFromContourSegmentation };
