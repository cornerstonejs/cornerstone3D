import type { Types } from '@cornerstonejs/core';

export type CroppedLabelmap = {
  scalarData: Types.PixelDataTypedArray;
  dimensions: Types.Point3;
  origin: Types.Point3;
};

/**
 * Crops a labelmap volume to the voxels of one segment.
 *
 * The labelmap-to-surface worker copies the scalar data it is given into
 * 32-bit buffers inside a WebAssembly heap capped at 2 GiB, so a full
 * 512 x 512 x 1204 labelmap (315 million voxels, 1.26 GB per copy) aborts the
 * worker however small the segment is. The surface only depends on the
 * segment's own voxels, so the worker gets the smallest block that holds them,
 * with one voxel of margin on every side so the surface still closes where the
 * segment touches the block, clamped to the volume.
 *
 * @param scalarData - The labelmap voxels, `i` fastest, then `j`, then `k`
 * @param dimensions - The labelmap dimensions
 * @param spacing - The labelmap spacing
 * @param origin - The world position of voxel [0, 0, 0]
 * @param direction - The labelmap direction: row, column and normal cosines
 * @param segmentIndex - The segment to keep
 * @returns The cropped block and the world position of its first voxel, or
 *   `undefined` when no voxel holds the segment
 */
export function cropLabelmapToSegment(
  scalarData: ArrayLike<number>,
  dimensions: Types.Point3,
  spacing: Types.Point3,
  origin: Types.Point3,
  direction: Types.Mat3 | number[],
  segmentIndex: number
): CroppedLabelmap | undefined {
  const [width, height, depth] = dimensions;
  const sliceSize = width * height;
  const min = [width, height, depth];
  const max = [-1, -1, -1];

  for (let k = 0; k < depth; k++) {
    const sliceOffset = k * sliceSize;
    for (let j = 0; j < height; j++) {
      const rowOffset = sliceOffset + j * width;
      for (let i = 0; i < width; i++) {
        if (scalarData[rowOffset + i] !== segmentIndex) {
          continue;
        }
        if (i < min[0]) min[0] = i;
        if (i > max[0]) max[0] = i;
        if (j < min[1]) min[1] = j;
        if (j > max[1]) max[1] = j;
        if (k < min[2]) min[2] = k;
        if (k > max[2]) max[2] = k;
      }
    }
  }

  if (max[0] < 0) {
    return undefined;
  }

  const start = min.map((value) => Math.max(0, value - 1));
  const end = max.map((value, axis) =>
    Math.min(dimensions[axis] - 1, value + 1)
  );
  const croppedDimensions = start.map(
    (value, axis) => end[axis] - value + 1
  ) as Types.Point3;
  const [croppedWidth, croppedHeight, croppedDepth] = croppedDimensions;

  // Keep the labelmap's voxel type, so segment indices above 255 survive. A
  // plain array has no voxel type; the worker reads voxels as 32-bit integers.
  const ArrayType = (
    ArrayBuffer.isView(scalarData) ? scalarData.constructor : Int32Array
  ) as new (length: number) => Types.PixelDataTypedArray;
  const croppedScalarData = new ArrayType(
    croppedWidth * croppedHeight * croppedDepth
  );

  let target = 0;
  for (let k = start[2]; k <= end[2]; k++) {
    for (let j = start[1]; j <= end[1]; j++) {
      const rowOffset = k * sliceSize + j * width;
      for (let i = start[0]; i <= end[0]; i++) {
        croppedScalarData[target++] = scalarData[rowOffset + i];
      }
    }
  }

  // Each index axis advances along its own cosine of the direction.
  const croppedOrigin = [0, 1, 2].map(
    (component) =>
      origin[component] +
      start[0] * spacing[0] * direction[component] +
      start[1] * spacing[1] * direction[3 + component] +
      start[2] * spacing[2] * direction[6 + component]
  ) as Types.Point3;

  return {
    scalarData: croppedScalarData,
    dimensions: croppedDimensions,
    origin: croppedOrigin,
  };
}
