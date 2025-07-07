import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BaseVolumeViewport, cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  getSegmentation,
  getCurrentLabelmapImageIdForViewport,
} from '../../stateManagement/segmentation/segmentationState';
import type { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { getLabelmapActorEntry } from '../../stateManagement/segmentation/helpers';

type Options = {
  viewport?: Types.IViewport;
  searchRadius?: number;
};

/**
 * Retrieves the segment index at the border of a labelmap in a segmentation.
 *
 * For volume segmentations, supports both single and multi-volume segmentations (volumeId or volumeIds).
 * The function loops through all available volumes and returns the first segment index found at the border.
 *
 * For stack segmentations, the behavior is unchanged.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param worldPoint - The world coordinates of the point.
 * @param options - Additional options.
 * @param options.viewport - The viewport to use.
 * @param options.searchRadius - The search radius to use.
 * @returns The segment index at the labelmap border, or undefined if not found in any volume.
 */
export function getSegmentIndexAtLabelmapBorder(
  segmentationId: string,
  worldPoint: Types.Point3,
  { viewport, searchRadius }: Options
): number | undefined {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    return undefined;
  }
  const labelmapData = segmentation.representationData.Labelmap;

  if (viewport instanceof BaseVolumeViewport) {
    // Support both single and multi-volume segmentations
    const volumeIds =
      (labelmapData as LabelmapSegmentationDataVolume).volumeIds || [];
    for (const vid of volumeIds) {
      if (!vid) {
        continue;
      }
      const segmentationVolume = cache.getVolume(vid);
      if (
        !segmentationVolume ||
        !segmentationVolume.voxelManager ||
        !segmentationVolume.imageData
      ) {
        continue;
      }
      const voxelManager = segmentationVolume.voxelManager;
      const imageData = segmentationVolume.imageData;
      const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);
      const segmentIndex = voxelManager.getAtIJK(
        indexIJK[0],
        indexIJK[1],
        indexIJK[2]
      ) as number | undefined;
      if (segmentIndex === undefined) {
        continue;
      }
      const canvasPoint = viewport.worldToCanvas(worldPoint);
      if (!canvasPoint) {
        continue;
      }
      const onEdge = isSegmentOnEdgeCanvas(
        canvasPoint as Types.Point2,
        segmentIndex,
        viewport,
        imageData,
        searchRadius
      );
      if (onEdge) {
        return segmentIndex;
      }
    }
    return undefined;
  }

  // stack segmentation case
  if (!viewport) {
    return undefined;
  }
  const segmentationImageId = getCurrentLabelmapImageIdForViewport(
    viewport.id,
    segmentationId
  );
  const image = cache.getImage(segmentationImageId);
  if (!image) {
    return undefined;
  }
  const segmentationActorEntry = getLabelmapActorEntry(
    viewport.id,
    segmentationId
  );
  const imageData = segmentationActorEntry?.actor.getMapper().getInputData();
  if (!imageData) {
    return undefined;
  }
  const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);
  if (!indexIJK) {
    return undefined;
  }
  const dimensions = imageData.getDimensions();
  let voxelManager = imageData.voxelManager as
    | Types.IVoxelManager<number>
    | undefined;
  if (!voxelManager) {
    const scalars = imageData.getPointData().getScalars();
    if (!scalars) {
      return undefined;
    }
    voxelManager = utilities.VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData: scalars.getData(),
    }) as Types.IVoxelManager<number>;
  }
  const segmentIndex = voxelManager.getAtIJKPoint(indexIJK as Types.Point3);
  if (segmentIndex === undefined) {
    return undefined;
  }
  const onEdge = isSegmentOnEdgeIJK(
    indexIJK as Types.Point3,
    dimensions,
    voxelManager,
    segmentIndex
  );
  return onEdge ? segmentIndex : undefined;
}

/**
 * Checks if a segment is on the edge of a labelmap.
 * @param getNeighborIndex - A function that returns the neighbor index given the delta values.
 * @param segmentIndex - The index of the segment to check.
 * @param searchRadius - The radius within which to search for neighboring segments. Default is 1.
 * @returns A boolean indicating whether the segment is on the edge.
 */
function isSegmentOnEdge(
  getNeighborIndex: (
    deltaI: number,
    deltaJ: number,
    deltaK: number
  ) => number | undefined,
  segmentIndex: number,
  searchRadius = 1 // Default search radius
): boolean {
  const neighborRange = Array.from(
    { length: 2 * searchRadius + 1 },
    (_, i) => i - searchRadius
  );

  for (const deltaI of neighborRange) {
    for (const deltaJ of neighborRange) {
      for (const deltaK of neighborRange) {
        if (deltaI === 0 && deltaJ === 0 && deltaK === 0) {
          continue; // Skipping the central point
        }

        const neighborIndex = getNeighborIndex(deltaI, deltaJ, deltaK);

        if (neighborIndex !== undefined && segmentIndex !== neighborIndex) {
          return true; // On the edge
        }
      }
    }
  }

  return false; // No edge neighbors found
}

function isSegmentOnEdgeIJK(
  indexIJK: Types.Point3,
  dimensions: Types.Point3,
  voxelManager: Types.IVoxelManager<number>,
  segmentIndex: number,
  searchRadius?: number
): boolean {
  const getNeighborIndex = (deltaI: number, deltaJ: number, deltaK: number) => {
    const neighborIJK = [
      indexIJK[0] + deltaI,
      indexIJK[1] + deltaJ,
      indexIJK[2] + deltaK,
    ];

    return voxelManager.getAtIJK(
      neighborIJK[0],
      neighborIJK[1],
      neighborIJK[2]
    );
  };

  return isSegmentOnEdge(getNeighborIndex, segmentIndex, searchRadius);
}

function isSegmentOnEdgeCanvas(
  canvasPoint: Types.Point2,
  segmentIndex: number,
  viewport: Types.IViewport,
  imageData: vtkImageData,
  searchRadius?: number
): boolean {
  const getNeighborIndex = (deltaI: number, deltaJ: number) => {
    const neighborCanvas = [canvasPoint[0] + deltaI, canvasPoint[1] + deltaJ];

    const worldPoint = viewport.canvasToWorld(neighborCanvas as Types.Point2);

    // @ts-expect-error
    const voxelManager = imageData.get('voxelManager').voxelManager;

    const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);

    return voxelManager.getAtIJK(indexIJK[0], indexIJK[1], indexIJK[2]);
  };

  return isSegmentOnEdge(getNeighborIndex, segmentIndex, searchRadius);
}
