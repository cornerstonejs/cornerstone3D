import type { Types, utilities } from '@cornerstonejs/core';

/**
 * The voxels of one frame (one `k`) of a labelmap: either the runs of an RLE
 * map, read as `map.getRun(j, 0)` with a default of 0, or a dense array with `i`
 * fastest, then `j`.
 */
export type LabelmapFrame =
  | { map: utilities.RLEVoxelMap<number> }
  | { data: ArrayLike<number> };

/** The smallest and the largest index of the voxels of one segment. */
export type SegmentBounds = { min: Types.Point3; max: Types.Point3 };

/** A block of a labelmap: the index of its first voxel and its size. */
export type LabelmapBlock = { start: Types.Point3; dimensions: Types.Point3 };

/**
 * Gives the main thread a chance to render. A `MessageChannel` message is not
 * clamped to 4 ms like a nested `setTimeout`, which matters over 1000 frames.
 */
function yieldToMain(): Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}

/**
 * Finds the bounds of several segments in one scan of a labelmap.
 *
 * The labelmap is read one frame at a time, and the function yields to the main
 * thread after each frame, so a large labelmap does not freeze the viewer. An
 * RLE frame is read as runs, so its cost follows the number of runs, not the
 * number of voxels.
 *
 * @param dimensions - The labelmap dimensions
 * @param getFrame - Gives the voxels of frame `k`
 * @param segmentIndices - The segments to find
 * @returns The bounds of each segment that has at least one voxel
 */
export async function findSegmentBounds(
  dimensions: Types.Point3,
  getFrame: (k: number) => LabelmapFrame,
  segmentIndices: number[]
): Promise<Map<number, SegmentBounds>> {
  const [width, height, depth] = dimensions;
  const found = new Map<number, SegmentBounds>();
  const wanted = new Set(segmentIndices);
  const extend = (value: number, iMin: number, iMax: number, j, k) => {
    if (!wanted.has(value)) {
      return;
    }
    const bounds = found.get(value);
    if (!bounds) {
      found.set(value, { min: [iMin, j, k], max: [iMax, j, k] });
      return;
    }
    const { min, max } = bounds;
    if (iMin < min[0]) min[0] = iMin;
    if (iMax > max[0]) max[0] = iMax;
    if (j < min[1]) min[1] = j;
    if (j > max[1]) max[1] = j;
    max[2] = k;
  };

  for (let k = 0; k < depth; k++) {
    const frame = getFrame(k);
    for (let j = 0; j < height; j++) {
      if ('map' in frame) {
        for (const { start, end, value } of frame.map.getRun(j, 0) ?? []) {
          extend(value, start, end - 1, j, k);
        }
        continue;
      }
      const rowOffset = j * width;
      for (let i = 0; i < width; i++) {
        const value = frame.data[rowOffset + i];
        if (value) {
          extend(value, i, i, j, k);
        }
      }
    }
    await yieldToMain();
  }

  return found;
}

/**
 * Gives the block that a segment's surface needs: its bounds with one voxel of
 * margin on every side, so the surface still closes where the segment touches
 * the block, clamped to the volume.
 */
export function getSegmentBlock(
  { min, max }: SegmentBounds,
  dimensions: Types.Point3
): LabelmapBlock {
  const start = min.map((value) => Math.max(0, value - 1)) as Types.Point3;
  const end = max.map((value, axis) =>
    Math.min(dimensions[axis] - 1, value + 1)
  );
  return {
    start,
    dimensions: start.map(
      (value, axis) => end[axis] - value + 1
    ) as Types.Point3,
  };
}

/**
 * Copies one block of a labelmap, one frame at a time, and yields to the main
 * thread after each frame.
 *
 * The labelmap-to-surface worker copies the scalar data it is given into
 * 32-bit buffers inside a WebAssembly heap capped at 2 GiB, so a full
 * 512 x 512 x 1204 labelmap (315 million voxels, 1.26 GB per copy) aborts the
 * worker however small the segment is. The worker gets the block of the
 * segment instead (see `getSegmentBlock`).
 *
 * @param dimensions - The labelmap dimensions
 * @param getFrame - Gives the voxels of frame `k`
 * @param ArrayType - The voxel type of the block
 * @param block - The block to copy
 * @returns The voxels of the block, `i` fastest, then `j`, then `k`
 */
export async function cropLabelmapToBlock(
  dimensions: Types.Point3,
  getFrame: (k: number) => LabelmapFrame,
  ArrayType: new (length: number) => Types.PixelDataTypedArray,
  { start, dimensions: blockDimensions }: LabelmapBlock
): Promise<Types.PixelDataTypedArray> {
  const width = dimensions[0];
  const [blockWidth, blockHeight, blockDepth] = blockDimensions;
  const end = start.map((value, axis) => value + blockDimensions[axis] - 1);
  const blockData = new ArrayType(blockWidth * blockHeight * blockDepth);

  for (let k = start[2]; k <= end[2]; k++) {
    const frame = getFrame(k);
    for (let j = start[1]; j <= end[1]; j++) {
      const target =
        ((k - start[2]) * blockHeight + (j - start[1])) * blockWidth - start[0];
      if ('map' in frame) {
        // The block starts as zeros, so only the runs need a write.
        for (const { start: runStart, end: runEnd, value } of frame.map.getRun(
          j,
          0
        ) ?? []) {
          const iEnd = Math.min(runEnd - 1, end[0]);
          for (let i = Math.max(runStart, start[0]); i <= iEnd; i++) {
            blockData[target + i] = value;
          }
        }
        continue;
      }
      const rowOffset = j * width;
      for (let i = start[0]; i <= end[0]; i++) {
        blockData[target + i] = frame.data[rowOffset + i];
      }
    }
    await yieldToMain();
  }

  return blockData;
}
