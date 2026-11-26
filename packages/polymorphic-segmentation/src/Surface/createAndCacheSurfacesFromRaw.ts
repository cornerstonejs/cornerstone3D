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
 * The frame of reference of the data that a segment of a segmentation is
 * converted from, the representation `source`: for a labelmap, of its volume
 * or the volume that it references, else of its images, else of the images
 * that it was made from (`getSourceImageIds`), or the one that core makes up
 * for those images when they have none; for contours, of the first
 * annotation of the segment that has one. The viewport of the conversion
 * gives it when the source has none.
 */
function getFrameOfReferenceUID(
  segmentation: ToolsTypes.Segmentation,
  source: ToolsEnums.SegmentationRepresentations,
  segmentIndex: number,
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

    const labelmapImageFrameOfReferenceUID = getImageFrameOfReferenceUID(
      labelmap?.imageIds?.[0]
    );

    if (labelmapImageFrameOfReferenceUID) {
      return labelmapImageFrameOfReferenceUID;
    }

    const sourceImageIds = getSourceImageIds(labelmap);

    if (sourceImageIds.length) {
      return (
        getImageFrameOfReferenceUID(sourceImageIds[0]) ||
        utilities.getImagesFrameOfReferenceUID(sourceImageIds)
      );
    }
  }

  if (source === SegmentationRepresentations.Contour) {
    for (const annotationUID of contour?.annotationUIDsMap?.get(segmentIndex) ??
      []) {
      const frameOfReferenceUID =
        getAnnotation(annotationUID)?.metadata?.FrameOfReferenceUID;
      if (frameOfReferenceUID) {
        return frameOfReferenceUID;
      }
    }
  }

  return viewport?.getFrameOfReferenceUID();
}

/** The frame of reference of an image in its image plane module. */
function getImageFrameOfReferenceUID(
  imageId: string | undefined
): string | undefined {
  return imageId
    ? (
        metaData.get('imagePlaneModule', imageId) as
          | Types.ImagePlaneModule
          | undefined
      )?.frameOfReferenceUID
    : undefined;
}

/**
 * The images that a labelmap was made from, in the forms that a labelmap
 * names them: the images of the volume that it references (its own
 * `referencedVolumeId`, else the one of its labelmap volume), else its
 * `referencedImageIds`, else the `referencedImageId` of each of its images,
 * as a derived labelmap image names the image that it overlays. A planar
 * viewport of those images has their frame of reference, so the surface lies
 * in its frame.
 */
function getSourceImageIds(
  labelmap: ToolsTypes.LabelmapSegmentationData | undefined
): string[] {
  const labelmapVolume = labelmap?.volumeId
    ? cache.getVolume(labelmap.volumeId)
    : undefined;
  const referencedVolumeId =
    labelmap?.referencedVolumeId || labelmapVolume?.referencedVolumeId;
  const referencedVolumeImageIds = referencedVolumeId
    ? cache.getVolume(referencedVolumeId)?.imageIds
    : undefined;

  if (referencedVolumeImageIds?.length) {
    return referencedVolumeImageIds;
  }

  if (labelmap?.referencedImageIds?.length) {
    return labelmap.referencedImageIds;
  }

  return (labelmap?.imageIds ?? labelmapVolume?.imageIds ?? [])
    .map((imageId) => cache.getImage(imageId)?.referencedImageId)
    .filter(Boolean);
}

/**
 * The color of a segment for its surface: the one that the viewport of the
 * conversion gives it, else the one of a viewport that shows the
 * segmentation, else the one of the default color LUT. The viewport of a
 * conversion may stop showing the segmentation before the worker answers,
 * and the surface display colors a surface by its representation anyway.
 */
function getSurfaceColor(
  viewportId: string | undefined,
  segmentationId: string,
  segmentIndex: number
): Types.Point3 {
  const viewportIds = new Set([
    viewportId,
    ...cornerstoneTools.segmentation.state.getViewportIdsWithSegmentation(
      segmentationId
    ),
  ]);

  for (const id of viewportIds) {
    const color = id
      ? getSegmentIndexColor(id, segmentationId, segmentIndex)
      : undefined;

    if (color) {
      return color.slice(0, 3) as Types.Point3;
    }
  }

  const { COLOR_LUT } = cornerstoneTools.CONSTANTS;

  return COLOR_LUT[segmentIndex % COLOR_LUT.length].slice(0, 3) as Types.Point3;
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

  const geometryIds = new Map<number, string>();

  // Loop through raw surfaces data and create surfaces
  const promises = Object.keys(rawSurfacesData).map(async (index: string) => {
    const rawSurfaceData = rawSurfacesData[index];
    const segmentIndex = rawSurfaceData.segmentIndex;

    const color = getSurfaceColor(
      options.viewport?.id,
      segmentation.segmentationId,
      segmentIndex
    );

    if (!rawSurfaceData.data?.points) {
      throw new Error('No points found for surface');
    }
    const closedSurface = {
      id: `segmentation_${segmentation.segmentationId}_surface_${segmentIndex}`,
      color,
      frameOfReferenceUID: getFrameOfReferenceUID(
        segmentation,
        source,
        segmentIndex,
        options.viewport
      ),
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
