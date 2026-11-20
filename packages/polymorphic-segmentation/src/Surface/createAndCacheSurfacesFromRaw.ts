import type { Types } from '@cornerstonejs/core';
import {
  cache,
  Enums,
  geometryLoader,
  metaData,
  utilities,
} from '@cornerstonejs/core';
import type { RawSurfacesData } from './surfaceComputationStrategies';
import type { PolySegConversionOptions } from '../types';
import * as cornerstoneTools from '@cornerstonejs/tools';
import type {
  Enums as ToolsEnums,
  Types as ToolsTypes,
} from '@cornerstonejs/tools';

const { getSegmentation } = cornerstoneTools.segmentation.state;
const { getSegmentIndexColor } = cornerstoneTools.segmentation.config.color;
const { getAnnotation } = cornerstoneTools.annotation.state;
const { SegmentationRepresentations } = cornerstoneTools.Enums;

/**
 * The frame of reference of the data that a segmentation is converted from,
 * the representation `source`: for a labelmap, of its volume or the volume
 * that it references, else of its images or the images that it references;
 * for contours, of their annotations. The viewport of the conversion gives
 * it when the source has none.
 */
function getFrameOfReferenceUID(
  segmentation: ToolsTypes.Segmentation,
  source: ToolsEnums.SegmentationRepresentations,
  viewport?: Types.IViewport
): string | undefined {
  const { Labelmap: labelmap, Contour: contour } =
    segmentation.representationData;

  if (source === SegmentationRepresentations.Labelmap) {
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

    const sourceImagesFrameOfReferenceUID =
      getSourceImagesFrameOfReferenceUID(labelmap);

    if (sourceImagesFrameOfReferenceUID) {
      return sourceImagesFrameOfReferenceUID;
    }
  }

  if (source === SegmentationRepresentations.Contour) {
    for (const annotationUIDs of contour?.annotationUIDsMap?.values() ?? []) {
      for (const annotationUID of annotationUIDs) {
        const frameOfReferenceUID =
          getAnnotation(annotationUID)?.metadata?.FrameOfReferenceUID;
        if (frameOfReferenceUID) {
          return frameOfReferenceUID;
        }
      }
    }
  }

  return viewport?.getFrameOfReferenceUID();
}

/**
 * The frame of reference that core makes up for the images that a labelmap
 * was made from (`utilities.getImagesFrameOfReferenceUID`), for images that
 * have none: the images of the volume that the labelmap volume references,
 * else the images that the labelmap references. A planar viewport of those
 * images has that frame of reference, so the surface lies in its frame.
 */
function getSourceImagesFrameOfReferenceUID(
  labelmap: ToolsTypes.LabelmapSegmentationData | undefined
): string | undefined {
  const referencedVolumeId =
    labelmap?.volumeId &&
    cache.getVolume(labelmap.volumeId)?.referencedVolumeId;
  const imageIds =
    (referencedVolumeId && cache.getVolume(referencedVolumeId)?.imageIds) ||
    labelmap?.referencedImageIds;

  return imageIds?.length
    ? utilities.getImagesFrameOfReferenceUID(imageIds)
    : undefined;
}

/**
 * Creates and caches surfaces from raw surface data.
 *
 * @param segmentationId - The id of the segmentation
 * @param rawSurfacesData - The raw surface data
 * @param options - Optional parameters for creating and caching surfaces
 * @param source - The representation that the raw surfaces were converted
 * from, Labelmap or Contour, whose frame of reference the surfaces take
 * @returns An object containing the IDs of the created surfaces
 */
export async function createAndCacheSurfacesFromRaw(
  segmentationId: string,
  rawSurfacesData: RawSurfacesData,
  options: PolySegConversionOptions,
  source: ToolsEnums.SegmentationRepresentations
) {
  // Initialize segmentationRepresentation and toolGroupId if a representation UID is provided

  const segmentation = getSegmentation(segmentationId);
  const frameOfReferenceUID = getFrameOfReferenceUID(
    segmentation,
    source,
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
