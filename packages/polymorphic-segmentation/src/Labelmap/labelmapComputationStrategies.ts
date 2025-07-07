import type { Types } from '@cornerstonejs/core';
import { volumeLoader, imageLoader, VolumeViewport } from '@cornerstonejs/core';
import { utilities } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import {
  convertContourToStackLabelmap,
  convertContourToVolumeLabelmap,
} from './convertContourToLabelmap';
import { convertSurfaceToVolumeLabelmap } from './convertSurfaceToLabelmap';
import type { PolySegConversionOptions } from '../types';

const { computeStackLabelmapFromVolume, getUniqueSegmentIndices } =
  utilities.segmentation;
const { getSegmentation } = cornerstoneTools.segmentation.state;

export type RawLabelmapData =
  | ToolsTypes.LabelmapSegmentationDataVolume
  | ToolsTypes.LabelmapSegmentationDataStack;

export async function computeLabelmapData(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  try {
    // Input validation
    if (!segmentationId) {
      throw new Error('Segmentation ID is required');
    }

    const segmentation = getSegmentation(segmentationId);
    if (!segmentation) {
      throw new Error(`Segmentation not found: ${segmentationId}`);
    }

    if (!segmentation.representationData) {
      throw new Error(
        `No representation data found for segmentation: ${segmentationId}`
      );
    }

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    if (!segmentIndices || segmentIndices.length === 0) {
      throw new Error(
        `No valid segment indices found for segmentation: ${segmentationId}`
      );
    }

    let rawLabelmapData: RawLabelmapData;
    const representationData = segmentation.representationData;

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
    } else {
      throw new Error(
        `Unsupported representation data type. Expected Contour or Surface, got: ${Object.keys(
          representationData
        )}`
      );
    }

    if (!rawLabelmapData) {
      throw new Error(
        'Failed to compute labelmap data. No valid conversion result produced.'
      );
    }

    return rawLabelmapData;
  } catch (error) {
    console.error(
      `Failed to compute labelmap data for segmentation ${segmentationId}:`,
      error
    );
    throw error;
  }
}

async function computeLabelmapFromContourSegmentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
): Promise<
  | ToolsTypes.LabelmapSegmentationDataVolume
  | ToolsTypes.LabelmapSegmentationDataStack
> {
  try {
    // Input validation
    if (!segmentationId) {
      throw new Error('Segmentation ID is required');
    }

    const segmentation = getSegmentation(segmentationId);
    if (!segmentation) {
      throw new Error(`Segmentation not found: ${segmentationId}`);
    }

    if (!segmentation.representationData?.Contour) {
      throw new Error(
        `No contour representation data found for segmentation: ${segmentationId}`
      );
    }

    const isVolume = options.viewport
      ? options.viewport instanceof VolumeViewport
      : true;

    if (isVolume && !options.viewport) {
      throw new Error(
        'Cannot compute labelmap from contour segmentation without providing the viewport for volume mode'
      );
    }

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    if (!segmentIndices || segmentIndices.length === 0) {
      throw new Error(
        `No valid segment indices found for segmentation: ${segmentationId}`
      );
    }

    const representationData = segmentation.representationData.Contour;

    const convertFunction = isVolume
      ? convertContourToVolumeLabelmap
      : convertContourToStackLabelmap;

    const result = await convertFunction(representationData, {
      segmentIndices,
      viewport: options.viewport,
    });

    if (!result) {
      throw new Error('Failed to convert contour to labelmap');
    }

    return result;
  } catch (error) {
    console.error(
      `Failed to compute labelmap from contour segmentation ${segmentationId}:`,
      error
    );
    throw error;
  }
}

async function computeLabelmapFromSurfaceSegmentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
): Promise<
  | ToolsTypes.LabelmapSegmentationDataVolume
  | ToolsTypes.LabelmapSegmentationDataStack
> {
  try {
    // Input validation
    if (!segmentationId) {
      throw new Error('Segmentation ID is required');
    }

    const segmentation = getSegmentation(segmentationId);
    if (!segmentation) {
      throw new Error(`Segmentation not found: ${segmentationId}`);
    }

    if (!segmentation.representationData?.Surface) {
      throw new Error(
        `No surface representation data found for segmentation: ${segmentationId}`
      );
    }

    const { viewport } = options;
    const isVolume = viewport ? viewport instanceof VolumeViewport : true;

    const segmentIndices = options.segmentIndices?.length
      ? options.segmentIndices
      : getUniqueSegmentIndices(segmentationId);

    if (!segmentIndices || segmentIndices.length === 0) {
      throw new Error(
        `No valid segment indices found for segmentation: ${segmentationId}`
      );
    }

    const segmentsGeometryIds = new Map() as Map<number, string>;
    const representationData = segmentation.representationData.Surface;

    if (!representationData.geometryIds) {
      throw new Error(
        `No geometry IDs found in surface representation data for segmentation: ${segmentationId}`
      );
    }

    // Build geometry IDs map for valid segments
    representationData.geometryIds.forEach((geometryId, segmentIndex) => {
      if (segmentIndices.includes(segmentIndex)) {
        segmentsGeometryIds.set(segmentIndex, geometryId);
      }
    });

    if (segmentsGeometryIds.size === 0) {
      throw new Error(
        `No valid geometry IDs found for segment indices: ${segmentIndices.join(
          ', '
        )}`
      );
    }

    if (isVolume && !viewport) {
      throw new Error(
        'Cannot compute labelmap from surface segmentation without providing the viewport for volume mode'
      );
    }

    let segmentationVolume;

    try {
      if (isVolume) {
        const volumeViewport = viewport as Types.IVolumeViewport;
        const volumeId = volumeViewport.getVolumeId();

        if (!volumeId) {
          throw new Error('No volume ID found in viewport');
        }

        segmentationVolume =
          volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId);

        if (!segmentationVolume) {
          throw new Error(
            `Failed to create derived labelmap volume from: ${volumeId}`
          );
        }
      } else {
        const stackViewport = viewport as Types.IStackViewport;

        if (!stackViewport) {
          throw new Error('Stack viewport is required for stack mode');
        }

        const imageIds = stackViewport.getImageIds();

        if (!imageIds || imageIds.length === 0) {
          throw new Error('No image IDs found in stack viewport');
        }

        const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(
          imageIds
        );

        if (!segImages || segImages.length === 0) {
          throw new Error('Failed to create derived labelmap images');
        }

        const segImageIds = segImages.map((image) => image.imageId);

        segmentationVolume = await volumeLoader.createAndCacheVolumeFromImages(
          'generatedSegmentationVolumeId',
          segImageIds
        );

        if (!segmentationVolume) {
          throw new Error('Failed to create volume from segmentation images');
        }
      }

      const result = await convertSurfaceToVolumeLabelmap(
        { geometryIds: segmentsGeometryIds },
        segmentationVolume
      );

      if (!result) {
        throw new Error('Failed to convert surface to volume labelmap');
      }

      if (isVolume) {
        return {
          volumeIds: [result.volumeId],
        };
      }

      // Convert volume labelmap to stack labelmap
      const stackData = (await computeStackLabelmapFromVolume({
        volumeId: segmentationVolume.volumeId,
      })) as ToolsTypes.LabelmapSegmentationDataStack;

      if (!stackData?.imageIds || stackData.imageIds.length === 0) {
        throw new Error('Failed to compute stack labelmap from volume');
      }

      return {
        imageIds: stackData.imageIds,
      };
    } catch (conversionError) {
      throw new Error(
        `Failed during surface to labelmap conversion: ${
          conversionError instanceof Error
            ? conversionError.message
            : String(conversionError)
        }`
      );
    }
  } catch (error) {
    console.error(
      `Failed to compute labelmap from surface segmentation ${segmentationId}:`,
      error
    );
    throw error;
  }
}

export { computeLabelmapFromContourSegmentation };
