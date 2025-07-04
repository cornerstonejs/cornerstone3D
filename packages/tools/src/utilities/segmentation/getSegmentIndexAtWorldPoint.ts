import { BaseVolumeViewport, cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import {
  getSegmentation,
  getCurrentLabelmapImageIdsForViewport,
} from '../../stateManagement/segmentation/segmentationState';
import {
  getVolumeIds,
  type LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import type { ContourSegmentationAnnotation, Segmentation } from '../../types';
import { getAnnotation } from '../../stateManagement';
import { isPointInsidePolyline3D } from '../math/polyline';
import { getLabelmapActorEntry } from '../../stateManagement/segmentation/helpers/getSegmentationActor';

type Options = {
  representationType?: SegmentationRepresentations;
  viewport?: Types.IViewport;
};

/**
 * Get the segment at the specified world point in the viewport.
 * @param segmentationId - The ID of the segmentation to get the segment for.
 * @param worldPoint - The world point to get the segment for.
 *
 * @returns The index of the segment at the world point, or undefined if not found.
 */
export function getSegmentIndexAtWorldPoint(
  segmentationId: string,
  worldPoint: Types.Point3,
  options = {} as Options
): number {
  const segmentation = getSegmentation(segmentationId);

  const representationData = segmentation.representationData;

  // if representationType is not provided, we will use the first representation
  const desiredRepresentation =
    options?.representationType ?? Object.keys(representationData)[0];

  if (!desiredRepresentation) {
    throw new Error(
      `Segmentation ${segmentationId} does not have any representations`
    );
  }

  switch (desiredRepresentation) {
    case SegmentationRepresentations.Labelmap:
      return getSegmentIndexAtWorldForLabelmap(
        segmentation,
        worldPoint,
        options
      );
    case SegmentationRepresentations.Contour:
      return getSegmentIndexAtWorldForContour(
        segmentation,
        worldPoint,
        options
      );
    default:
      return;
  }
}

/**
 * Retrieves the segment index at a given world point for a labelmap segmentation.
 *
 * Supports both single and multi-volume segmentations. Handles the following cases:
 * - Single volume: `volumeId: string`
 * - Multi-volume: `volumeIds: string[]` or `volumeIdGroups: string[][]`
 *
 * Loops through all volumes (or groups of volumes) and returns the first valid, non-background segment index found at the world point.
 * For stack segmentations, loops through all imageIds and returns the first valid segment index found.
 *
 * @param segmentation - The segmentation object containing labelmap data.
 * @param worldPoint - The world point to retrieve the segment at.
 * @param options - Options including the viewport.
 * @returns The segment index at the given world point, or undefined if not found in any volume or stack.
 */
export function getSegmentIndexAtWorldForLabelmap(
  segmentation: Segmentation,
  worldPoint: Types.Point3,
  { viewport }: Options
): number | undefined {
  const labelmapData = segmentation.representationData.Labelmap;

  if (viewport instanceof BaseVolumeViewport) {
    // Support both single and multi-volume segmentations
    const allVolumeIds = getVolumeIds(
      labelmapData as LabelmapSegmentationDataVolume
    );
    for (const vid of allVolumeIds) {
      if (!vid) {
        continue;
      }
      const segmentationVolume = cache.getVolume(vid);
      if (!segmentationVolume) {
        continue;
      }
      const segmentIndex =
        segmentationVolume.imageData.getScalarValueFromWorld(worldPoint);
      if (segmentIndex !== undefined && segmentIndex !== null) {
        return segmentIndex;
      }
    }
    return;
  }

  // stack segmentation case
  const segmentationImageIds = getCurrentLabelmapImageIdsForViewport(
    viewport.id,
    segmentation.segmentationId
  );

  if (segmentationImageIds.length > 1) {
    console.warn(
      'Segment selection for labelmaps with multiple imageIds in stack viewports is not supported yet.'
    );
    return;
  }

  const segmentationImageId = segmentationImageIds[0];

  const image = cache.getImage(segmentationImageId);

  if (!image) {
    return;
  }

  const segmentationActorEntry = getLabelmapActorEntry(
    viewport.id,
    segmentation.segmentationId
  );
  const imageData = segmentationActorEntry?.actor.getMapper().getInputData();
  const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);

  const dimensions = imageData.getDimensions();
  const voxelManager = (imageData.voxelManager ||
    utilities.VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData: imageData.getPointData().getScalars().getData(),
    })) as Types.IVoxelManager<number>;

  const segmentIndex = voxelManager.getAtIJKPoint(indexIJK as Types.Point3);

  return segmentIndex;
}

/**
 * Retrieves the segment index at a given world point for contour segmentation.
 *
 * Loops through all contour segments and their annotations, returning the first segment index for which the world point is inside the contour on the current view plane.
 *
 * @param segmentation - The segmentation object containing contour data.
 * @param worldPoint - The world point to check.
 * @param options - The options for segmentation, including the viewport.
 * @returns The segment index at the given world point, or undefined if not found in any contour.
 */
export function getSegmentIndexAtWorldForContour(
  segmentation: Segmentation,
  worldPoint: Types.Point3,
  { viewport }: Options
): number {
  const contourData = segmentation.representationData.Contour;

  const segmentIndices = Array.from(contourData.annotationUIDsMap.keys());
  const { viewPlaneNormal } = viewport.getCamera();

  for (const segmentIndex of segmentIndices) {
    const annotationsSet = contourData.annotationUIDsMap.get(segmentIndex);

    if (!annotationsSet) {
      continue;
    }

    for (const annotationUID of annotationsSet) {
      const annotation = getAnnotation(
        annotationUID
      ) as ContourSegmentationAnnotation;

      if (!annotation) {
        continue;
      }

      const { polyline } = annotation.data.contour;

      if (
        !utilities.isEqual(viewPlaneNormal, annotation.metadata.viewPlaneNormal)
      ) {
        continue;
      }

      // This function checks whether we are inside the contour. It does not
      // check if we are exactly on the contour, which is highly unlikely given
      // the canvas pixel resolution of 1 decimal place we have by design.
      if (isPointInsidePolyline3D(worldPoint, polyline)) {
        return Number(segmentIndex);
      }
    }
  }
}
