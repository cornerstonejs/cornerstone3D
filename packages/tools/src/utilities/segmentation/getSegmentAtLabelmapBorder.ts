import { cache, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  getSegmentation,
  getSegmentationIdRepresentations,
} from '../../stateManagement/segmentation/segmentationState';
import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { isVolumeSegmentation } from '../../tools/segmentation/strategies/utils/stackVolumeCheck';

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
export function getSegmentAtLabelmapBorder(
  segmentationId: string,
  worldPoint: Types.Point3,
  { viewport, searchRadius }: Options
): number {
  const segmentation = getSegmentation(segmentationId);

  const labelmapData = segmentation.representationData.LABELMAP;

  if (isVolumeSegmentation(labelmapData)) {
    const { volumeId } = labelmapData as LabelmapSegmentationDataVolume;
    const segmentationVolume = cache.getVolume(volumeId);

    if (!segmentationVolume) {
      return;
    }

    const imageData = segmentationVolume.imageData;

    const segmentIndex = imageData.getScalarValueFromWorld(worldPoint);

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
  const { imageIdReferenceMap } = labelmapData as LabelmapSegmentationDataStack;

  const currentImageId = (viewport as Types.IStackViewport).getCurrentImageId();

  const segmentationImageId = imageIdReferenceMap.get(currentImageId);
  const image = cache.getImage(segmentationImageId);

  if (!image) {
    return;
  }

  // find the first segmentationRepresentationUID for the segmentationId, since
  // that is what we use as actorUID in the viewport

  const segmentationRepresentations = getSegmentationIdRepresentations(
    segmentation.segmentationId
  );

  const { segmentationRepresentationUID } = segmentationRepresentations[0];
  const segmentationActor = viewport.getActor(segmentationRepresentationUID);
  const imageData = segmentationActor?.actor.getMapper().getInputData();
  const indexIJK = utilities.transformWorldToIndex(imageData, worldPoint);

  const dimensions = imageData.getDimensions();
  const voxelManager = (imageData.voxelManager ||
    utilities.VoxelManager.createVolumeVoxelManager(
      dimensions,
      imageData.getPointData().getScalars().getData()
    )) as utilities.VoxelManager<number>;

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
  voxelManager: any,
  segmentIndex: number,
  searchRadius?: number
): boolean {
  const getNeighborIndex = (deltaI: number, deltaJ: number, deltaK: number) => {
    const neighborIJK = [
      indexIJK[0] + deltaI,
      indexIJK[1] + deltaJ,
      indexIJK[2] + deltaK,
    ];

    return voxelManager.getAtIJK(...neighborIJK);
  };

  return isSegmentOnEdge(getNeighborIndex, segmentIndex, searchRadius);
}

function isSegmentOnEdgeCanvas(
  canvasPoint: Types.Point2,
  segmentIndex: number,
  viewport: Types.IViewport,
  imageData: any,
  searchRadius?: number
): boolean {
  const getNeighborIndex = (deltaI: number, deltaJ: number) => {
    const neighborCanvas = [canvasPoint[0] + deltaI, canvasPoint[1] + deltaJ];

    const worldPoint = viewport.canvasToWorld(neighborCanvas as Types.Point2);
    return imageData.getScalarValueFromWorld(worldPoint);
  };

  return isSegmentOnEdge(getNeighborIndex, segmentIndex, searchRadius);
}
