import type { Types } from '@cornerstonejs/core';
import { cache } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
/**
 * Determines if there is a point between point1 and point2 which is not
 * contained in the segmentation
 */
export default function isLineInSegment(
  point1: Types.Point3,
  point2: Types.Point3,
  isInSegment
) {
  const ijk1 = isInSegment.toIJK(point1);
  const ijk2 = isInSegment.toIJK(point2);
  const testPoint = vec3.create();
  const { testIJK } = isInSegment;
  const delta = vec3.sub(vec3.create(), ijk1, ijk2);

  // Test once for index value between the two points, so the max of the
  // difference in IJK values
  const testSize = Math.round(Math.max(...delta.map(Math.abs)));
  if (testSize < 2) {
    // No need to test when there are only two points
    return true;
  }
  const unitDelta = vec3.scale(vec3.create(), delta, 1 / testSize);

  for (let i = 1; i < testSize; i++) {
    vec3.scaleAndAdd(testPoint, ijk2, unitDelta, i);
    if (!testIJK(testPoint)) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a function that tests if points are contained in the segment using raw volume metadata
 * @param width - The width (dimension[0]) of the volume
 * @param dimensions - The dimensions of the volume
 * @param imageData - The imageData object containing worldToIndex transformation
 * @param voxelManager - The voxelManager instance for getting values at indices
 * @param segmentIndex - The index of the segment to test for
 * @param containedSegmentIndices - Optional set of additional segment indices to consider as contained
 */
function createIsInSegmentMetadata({
  dimensions,
  imageData,
  voxelManager,
  segmentIndex,
  containedSegmentIndices,
}: {
  dimensions: number[];
  imageData: vtkImageData;
  voxelManager: Types.IVoxelManager<number>;
  segmentIndex: number;
  containedSegmentIndices?: Set<number>;
}) {
  const width = dimensions[0];
  const pixelsPerSlice = width * dimensions[1];

  return {
    testCenter: (point1, point2) => {
      const point = vec3.add(vec3.create(), point1, point2).map((it) => it / 2);
      const ijk = imageData.worldToIndex(point as vec3).map(Math.round);
      const [i, j, k] = ijk;
      const index = i + j * width + k * pixelsPerSlice;
      const value = voxelManager.getAtIndex(index) as number;
      return value === segmentIndex || containedSegmentIndices?.has(value);
    },

    toIJK: (point) => imageData.worldToIndex(point as vec3),

    testIJK: (ijk) => {
      const [i, j, k] = ijk;
      const index =
        Math.round(i) + Math.round(j) * width + Math.round(k) * pixelsPerSlice;
      const value = voxelManager.getAtIndex(index) as number;
      return value === segmentIndex || containedSegmentIndices?.has(value);
    },
  };
}

/**
 * Creates a function that tests to see if the provided line segment, specified
 * in LPS space (as endpoints) is contained in the segment using a volume ID
 * @param segVolumeId - The ID of the segmentation volume
 * @param segmentIndex - The index of the segment to test for
 * @param containedSegmentIndices - Optional set of additional segment indices to consider as contained
 */
function createIsInSegment(
  segVolumeId: string,
  segmentIndex: number,
  containedSegmentIndices?: Set<number>
) {
  const vol = cache.getVolume(segVolumeId);
  if (!vol) {
    console.warn(`No volume found for ${segVolumeId}`);
    return;
  }

  return createIsInSegmentMetadata({
    dimensions: vol.dimensions,
    imageData: vol.imageData,
    voxelManager: vol.voxelManager as Types.IVoxelManager<number>,
    segmentIndex,
    containedSegmentIndices,
  });
}

export { createIsInSegment, createIsInSegmentMetadata, isLineInSegment };
