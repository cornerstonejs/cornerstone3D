import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';
import {
  cache,
  utilities,
  getWebWorkerManager,
  volumeLoader,
  imageLoader,
  metaData,
  Enums,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type { PolySegConversionOptions } from '../types';

const { WorkerTypes } = cornerstoneTools.Enums;
const { segmentation } = cornerstoneTools;

const workerManager = getWebWorkerManager();

/**
 * Triggers worker progress event with error handling
 * @param eventTarget - The event target to trigger on
 * @param progress - Progress percentage (0-100)
 */
const triggerWorkerProgress = (eventTarget, progress: number) => {
  try {
    triggerEvent(eventTarget, Enums.Events.WEB_WORKER_PROGRESS, {
      progress,
      type: WorkerTypes.POLYSEG_CONTOUR_TO_LABELMAP,
    });
  } catch (error) {
    console.warn('Failed to trigger worker progress event:', error);
  }
};

/**
 * Validates and extracts image metadata with fallback defaults
 * @param imageId - The image ID to get metadata for
 * @returns Validated metadata object or null if invalid
 */
function getValidatedImageMetadata(imageId: string) {
  try {
    const imagePlaneModule = metaData.get(
      Enums.MetadataModules.IMAGE_PLANE,
      imageId
    );

    if (!imagePlaneModule) {
      console.warn(`No image plane metadata found for imageId: ${imageId}`);
      return null;
    }

    // Extract properties with proper validation
    const {
      columnCosines = [0, 1, 0],
      rowCosines = [1, 0, 0],
      rowPixelSpacing = 1,
      columnPixelSpacing = 1,
      imagePositionPatient = [0, 0, 0],
    } = imagePlaneModule;

    return {
      columnCosines,
      rowCosines,
      rowPixelSpacing,
      columnPixelSpacing,
      imagePositionPatient,
    };
  } catch (error) {
    console.error(`Failed to get metadata for imageId: ${imageId}`, error);
    return null;
  }
}

export async function convertContourToVolumeLabelmap(
  contourRepresentationData: ToolsTypes.ContourSegmentationData,
  options: PolySegConversionOptions = {}
) {
  try {
    const viewport = options.viewport as Types.IVolumeViewport;

    if (!viewport) {
      throw new Error('No viewport provided for volume labelmap conversion');
    }

    const volumeId = viewport.getVolumeId();
    if (!volumeId) {
      throw new Error('No volumeId found in viewport');
    }

    const imageIds = utilities.getViewportImageIds(viewport);
    if (!imageIds || imageIds.length === 0) {
      throw new Error(
        'No imageIds found, labelmap computation from contour requires viewports with imageIds'
      );
    }

    const segmentationVolumeId = utilities.uuidv4();

    const segmentationVolume = volumeLoader.createAndCacheDerivedLabelmapVolume(
      volumeId,
      {
        volumeId: segmentationVolumeId,
      }
    );

    if (!segmentationVolume) {
      throw new Error('Failed to create segmentation volume');
    }

    const { dimensions, origin, direction, spacing, voxelManager } =
      segmentationVolume;

    const { segmentIndices, annotationUIDsInSegmentMap } =
      segmentation.utilities.getAnnotationMapFromSegmentation(
        contourRepresentationData,
        options
      );

    if (!segmentIndices || segmentIndices.length === 0) {
      console.warn('No segment indices found for conversion');
      return {
        volumeIds: [segmentationVolume.volumeId],
      } as ToolsTypes.LabelmapSegmentationDataVolume;
    }

    triggerWorkerProgress(eventTarget, 0);

    const scalarData = voxelManager.getCompleteScalarDataArray?.();
    if (!scalarData) {
      throw new Error('Failed to get scalar data from voxel manager');
    }

    const newScalarData = await workerManager.executeTask(
      'polySeg',
      'convertContourToVolumeLabelmap',
      {
        segmentIndices,
        dimensions,
        scalarData,
        origin,
        direction,
        spacing,
        annotationUIDsInSegmentMap,
      },
      {
        callbacks: [
          (progress) => {
            triggerWorkerProgress(eventTarget, progress);
          },
        ],
      }
    );

    if (!newScalarData) {
      throw new Error(
        'Worker failed to process contour to volume labelmap conversion'
      );
    }

    triggerWorkerProgress(eventTarget, 100);

    voxelManager.setCompleteScalarDataArray(newScalarData);
    segmentationVolume.modified();

    return {
      volumeIds: [segmentationVolume.volumeId],
    } as ToolsTypes.LabelmapSegmentationDataVolume;
  } catch (error) {
    console.error('Failed to convert contour to volume labelmap:', error);
    throw error;
  }
}

export async function convertContourToStackLabelmap(
  contourRepresentationData: ToolsTypes.ContourSegmentationData,
  options: PolySegConversionOptions = {}
) {
  try {
    if (!options.viewport) {
      throw new Error(
        'No viewport provided, labelmap computation from contour requires viewports'
      );
    }

    const viewport = options.viewport as Types.IStackViewport;
    const imageIds = viewport.getImageIds();

    if (!imageIds || imageIds.length === 0) {
      throw new Error(
        'No imageIds found, labelmap computation from contour requires viewports with imageIds'
      );
    }

    // Validate that all imageIds are cached
    const missingImageIds: string[] = [];
    imageIds.forEach((imageId) => {
      if (!cache.getImageLoadObject(imageId)) {
        missingImageIds.push(imageId);
      }
    });

    if (missingImageIds.length > 0) {
      throw new Error(
        `ImageIds must be cached before converting contour to labelmap. Missing: ${missingImageIds.join(
          ', '
        )}`
      );
    }

    // Create segmentation images
    const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(
      imageIds
    );

    if (!segImages || segImages.length === 0) {
      throw new Error('Failed to create derived labelmap images');
    }

    const segmentationImageIds = segImages.map((it) => it.imageId);

    const { segmentIndices, annotationUIDsInSegmentMap } =
      segmentation.utilities.getAnnotationMapFromSegmentation(
        contourRepresentationData,
        options
      );

    if (!segmentIndices || segmentIndices.length === 0) {
      console.warn('No segment indices found for conversion');
      return {
        imageIds: segmentationImageIds,
      };
    }

    // Create segmentation information map
    const segmentationsInfo = new Map();

    // Process each segmentation image
    for (let index = 0; index < segmentationImageIds.length; index++) {
      const segImageId = segmentationImageIds[index];
      const originalImageId = imageIds[index];

      try {
        const segImage = cache.getImage(segImageId);
        if (!segImage) {
          throw new Error(`Failed to get segmentation image: ${segImageId}`);
        }

        const metadata = getValidatedImageMetadata(segImageId);
        if (!metadata) {
          console.warn(`Skipping image ${segImageId} due to invalid metadata`);
          continue;
        }

        const {
          columnCosines,
          rowCosines,
          rowPixelSpacing,
          columnPixelSpacing,
          imagePositionPatient,
        } = metadata;

        // Create vectors and calculate direction
        const rowCosineVec = vec3.fromValues(
          rowCosines[0],
          rowCosines[1],
          rowCosines[2]
        );
        const colCosineVec = vec3.fromValues(
          columnCosines[0],
          columnCosines[1],
          columnCosines[2]
        );

        const scanAxisNormal = vec3.create();
        vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

        const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal];
        const spacing = [rowPixelSpacing, columnPixelSpacing, 1];
        const origin = imagePositionPatient;

        const scalarData = segImage.voxelManager?.getScalarData();
        if (!scalarData) {
          throw new Error(`Failed to get scalar data for image: ${segImageId}`);
        }

        segmentationsInfo.set(originalImageId, {
          direction,
          spacing,
          origin,
          scalarData,
          imageId: segImageId,
          dimensions: [segImage.width, segImage.height, 1],
        });
      } catch (error) {
        console.error(
          `Failed to process segmentation image ${segImageId}:`,
          error
        );
        throw error;
      }
    }

    if (segmentationsInfo.size === 0) {
      throw new Error('No valid segmentation information could be processed');
    }

    triggerWorkerProgress(eventTarget, 0);

    const newSegmentationsScalarData = await workerManager.executeTask(
      'polySeg',
      'convertContourToStackLabelmap',
      {
        segmentationsInfo,
        annotationUIDsInSegmentMap,
        segmentIndices,
      },
      {
        callbacks: [
          (progress) => {
            triggerWorkerProgress(eventTarget, progress);
          },
        ],
      }
    );

    if (!newSegmentationsScalarData) {
      throw new Error(
        'Worker failed to process contour to stack labelmap conversion'
      );
    }

    triggerWorkerProgress(eventTarget, 100);

    // Update segmentation images with new data
    const segImageIds: string[] = [];
    newSegmentationsScalarData.forEach(({ scalarData }, referencedImageId) => {
      const segmentationInfo = segmentationsInfo.get(referencedImageId);
      if (!segmentationInfo) {
        console.warn(
          `No segmentation info found for imageId: ${referencedImageId}`
        );
        return;
      }

      const { imageId: segImageId } = segmentationInfo;
      const segImage = cache.getImage(segImageId);

      if (!segImage) {
        console.warn(`Segmentation image not found in cache: ${segImageId}`);
        return;
      }

      try {
        const existingScalarData = segImage.voxelManager?.getScalarData();
        if (existingScalarData) {
          existingScalarData.set(scalarData);
        }

        // Update pixel data if available
        if (segImage.imageFrame?.pixelData) {
          segImage.imageFrame.pixelData.set(scalarData);
        }

        segImageIds.push(segImageId);
      } catch (error) {
        console.error(
          `Failed to update segmentation image ${segImageId}:`,
          error
        );
      }
    });

    return {
      imageIds: segImageIds,
    };
  } catch (error) {
    console.error('Failed to convert contour to stack labelmap:', error);
    throw error;
  }
}
