import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BaseVolumeViewport, cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  getSegmentation,
  getCurrentLabelmapImageIdForViewport,
} from '../../stateManagement/segmentation/segmentationState';
import type { LabelmapSegmentationDataVolume } from '../../types/LabelmapTypes';
import { getSegmentationActorEntry } from '../../stateManagement/segmentation/helpers';
import { SegmentationRepresentations } from '../../enums';

type Options = {
  viewport?: Types.IViewport;
  searchRadius?: number;
};

/**
 * Retrieves the segment index at the border of a labelmap in a segmentation.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param worldPoint - The world coordinates of the point.
 * @param options - Additional options.
 * @param options.viewport - The viewport to use.
 * @param options.searchRadius - The search radius to use.
 * @returns The segment index at the labelmap border, or undefined if not found.
 */
export function getSegmentIndexAtLabelmapBorder(
  segmentationId: string,
  worldPoint: Types.Point3,
  { viewport, searchRadius }: Options
): number {
  const segmentation = getSegmentation(segmentationId);

  const labelmapData = segmentation.representationData.Labelmap;

  if (viewport instanceof BaseVolumeViewport) {
    const { volumeId } = labelmapData as LabelmapSegmentationDataVolume;
    const segmentationVolume = cache.getVolume(volumeId);

    if (!segmentationVolume) {
      return;
    }

    const voxelManager = segmentationVolume.voxelManager;
    const imageData = segmentationVolume.imageData;
    const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);
    const segmentIndex = voxelManager.getAtIJK(
      indexIJK[0],
      indexIJK[1],
      indexIJK[2]
    ) as number;

    const canvasPoint = viewport.worldToCanvas(worldPoint);

    const onEdge = isSegmentOnEdgeCanvas(
      canvasPoint as Types.Point2,
      segmentIndex,
      viewport,
      imageData,
      searchRadius
    );

    return onEdge ? segmentIndex : undefined;
  }

  // stack segmentation case
  const segmentationImageId = getCurrentLabelmapImageIdForViewport(
    viewport.id,
    segmentationId
  );

  const image = cache.getImage(segmentationImageId);

  if (!image) {
    return;
  }
  const segmentationActorEntry = getSegmentationActorEntry(viewport.id, {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  });
  const imageData = segmentationActorEntry?.actor.getMapper().getInputData();
  const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);

  const dimensions = imageData.getDimensions();
  const voxelManager = (imageData.voxelManager ||
    utilities.VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData: imageData.getPointData().getScalars().getData(),
    })) as Types.IVoxelManager<number>;

  const segmentIndex = voxelManager.getAtIJKPoint(indexIJK as Types.Point3);

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
