import { BaseVolumeViewport, cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { SegmentationRepresentations } from '../../enums';
import {
  getSegmentation,
  getCurrentLabelmapImageIdsForViewport,
} from '../../stateManagement/segmentation/segmentationState';
import type { ContourSegmentationAnnotation, Segmentation } from '../../types';
import { getAnnotation } from '../../stateManagement';
import { isPointInsidePolyline3D } from '../math/polyline';
import { getLabelmapActorEntry } from '../../stateManagement/segmentation/helpers/getSegmentationActor';
import getViewportLabelmapRenderMode from '../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  getLabelmaps,
  getOrCreateLabelmapVolume,
  getSegmentIndexForLabelValue,
} from '../../stateManagement/segmentation/helpers/labelmapSegmentationState';

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
 * Retrieves the segment index at a given world point for a labelmap.
 *
 * @param labelmapData - The labelmap segmentation data.
 * @param worldPoint - The world point to retrieve the segment at.
 *
 * @returns The segment index at the given world point, or undefined if not found.
 */
export function getSegmentIndexAtWorldForLabelmap(
  segmentation: Segmentation,
  worldPoint: Types.Point3,
  { viewport }: Options
): number | undefined {
  const viewportRenderMode = viewport
    ? getViewportLabelmapRenderMode(viewport)
    : 'unsupported';

  if (
    viewportRenderMode === 'volume' ||
    viewport instanceof BaseVolumeViewport
  ) {
    for (const layer of getLabelmaps(segmentation)) {
      const segmentationVolume = getOrCreateLabelmapVolume(layer);

      if (!segmentationVolume) {
        continue;
      }

      const labelValue =
        segmentationVolume.imageData.getScalarValueFromWorld(worldPoint);

      if (!labelValue) {
        continue;
      }

      return getSegmentIndexForLabelValue(
        segmentation,
        layer.labelmapId,
        labelValue
      );
    }

    return;
  }

  // stack segmentation case
  const segmentationImageIds = getCurrentLabelmapImageIdsForViewport(
    viewport.id,
    segmentation.segmentationId
  );

  if (!segmentationImageIds?.length) {
    return;
  }

  for (const segmentationImageId of segmentationImageIds) {
    const image = cache.getImage(segmentationImageId);

    if (!image) {
      continue;
    }

    const segmentationActorEntry = getLabelmapActorEntry(
      viewport.id,
      segmentation.segmentationId,
      segmentationImageId
    );
    const imageData = segmentationActorEntry?.actor.getMapper().getInputData();
    const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);

    const dimensions = imageData.getDimensions();
    const voxelManager = (imageData.voxelManager ||
      utilities.VoxelManager.createScalarVolumeVoxelManager({
        dimensions,
        scalarData: imageData.getPointData().getScalars().getData(),
      })) as Types.IVoxelManager<number>;

    const labelValue = voxelManager.getAtIJKPoint(indexIJK as Types.Point3);

    if (!labelValue) {
      continue;
    }

    const layer = getLabelmaps(segmentation).find((candidateLayer) =>
      candidateLayer.imageIds?.includes(segmentationImageId)
    );
    if (!layer) {
      return labelValue;
    }

    return getSegmentIndexForLabelValue(
      segmentation,
      layer.labelmapId,
      labelValue
    );
  }
}

/**
 * Retrieves the segment index at a given world point for contour segmentation.
 *
 * @param segmentation - The segmentation data.
 * @param worldPoint - The world point to check.
 * @param options - The options for segmentation.
 * @returns The segment index at the given world point, or undefined if not found.
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
