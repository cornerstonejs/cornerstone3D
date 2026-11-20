import type { Types } from '@cornerstonejs/core';
import { cache, Enums, geometryLoader, metaData } from '@cornerstonejs/core';
import type { RawSurfacesData } from './surfaceComputationStrategies';
import type { PolySegConversionOptions } from '../types';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type { Types as ToolsTypes } from '@cornerstonejs/tools';

const { getSegmentation } = cornerstoneTools.segmentation.state;
const { getSegmentIndexColor } = cornerstoneTools.segmentation.config.color;
const { getAnnotation } = cornerstoneTools.annotation.state;

/**
 * The frame of reference of the data that a segmentation is converted from:
 * of its labelmap volume or the volume that it references, else of the
 * images of its labelmap or the images that it references, else of the
 * annotations of its contours. The viewport of the conversion gives it when
 * none of them does.
 */
function getFrameOfReferenceUID(
  segmentation: ToolsTypes.Segmentation,
  viewport?: Types.IViewport
): string | undefined {
  const { Labelmap: labelmap, Contour: contour } =
    segmentation.representationData;

  for (const volumeId of [labelmap?.volumeId, labelmap?.referencedVolumeId]) {
    const frameOfReferenceUID =
      volumeId && cache.getVolume(volumeId)?.metadata?.FrameOfReferenceUID;
    if (frameOfReferenceUID) {
      return frameOfReferenceUID;
    }
  }

  for (const imageId of [
    labelmap?.imageIds?.[0],
    labelmap?.referencedImageIds?.[0],
  ]) {
    const frameOfReferenceUID =
      imageId &&
      (
        metaData.get('imagePlaneModule', imageId) as
          | Types.ImagePlaneModule
          | undefined
      )?.frameOfReferenceUID;
    if (frameOfReferenceUID) {
      return frameOfReferenceUID;
    }
  }

  for (const annotationUIDs of contour?.annotationUIDsMap?.values() ?? []) {
    for (const annotationUID of annotationUIDs) {
      const frameOfReferenceUID =
        getAnnotation(annotationUID)?.metadata?.FrameOfReferenceUID;
      if (frameOfReferenceUID) {
        return frameOfReferenceUID;
      }
    }
  }

  return viewport?.getFrameOfReferenceUID();
}

/**
 * Creates and caches surfaces from raw surface data.
 *
 * @param segmentationId - The id of the segmentation
 * @param rawSurfacesData - The raw surface data
 * @param options - Optional parameters for creating and caching surfaces
 * @returns An object containing the IDs of the created surfaces
 */
export async function createAndCacheSurfacesFromRaw(
  segmentationId: string,
  rawSurfacesData: RawSurfacesData,
  options: PolySegConversionOptions = {}
) {
  // Initialize segmentationRepresentation and toolGroupId if a representation UID is provided

  const segmentation = getSegmentation(segmentationId);
  const frameOfReferenceUID = getFrameOfReferenceUID(
    segmentation,
    options.viewport
  );

  const geometryIds = new Map<number, string>();

  // Loop through raw surfaces data and create surfaces
  const promises = Object.keys(rawSurfacesData).map(async (index: string) => {
    const rawSurfaceData = rawSurfacesData[index];
    const segmentIndex = rawSurfaceData.segmentIndex;

    // Get the color either from the segmentation representation or randomly generated
    const color = getSegmentIndexColor(
      options.viewport.id,
      segmentation.segmentationId,
      segmentIndex
    ).slice(0, 3);

    if (!color) {
      throw new Error(
        'No color found for segment index, unable to create surface'
      );
    }

    if (!rawSurfaceData.data?.points) {
      throw new Error('No points found for surface');
    }
    const closedSurface = {
      id: `segmentation_${segmentation.segmentationId}_surface_${segmentIndex}`,
      color,
      frameOfReferenceUID,
      points: rawSurfaceData.data.points,
      polys: rawSurfaceData.data.polys,
      segmentIndex,
    };

    const geometryId = closedSurface.id;
    geometryIds.set(segmentIndex, geometryId);

    return geometryLoader.createAndCacheGeometry(geometryId, {
      type: Enums.GeometryType.SURFACE,
      geometryData: closedSurface as unknown as Types.PublicSurfaceData,
    });
  });

  await Promise.all(promises);

  return {
    geometryIds,
  };
}
