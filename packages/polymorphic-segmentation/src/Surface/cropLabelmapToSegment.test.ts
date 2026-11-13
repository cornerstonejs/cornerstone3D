import { utilities } from '@cornerstonejs/core';
import {
  cropLabelmapToBlock,
  findSegmentBounds,
  getSegmentBlock,
} from './cropLabelmapToSegment';

/** A labelmap of the given size with `segmentIndex` at each listed voxel. */
function labelmap(dimensions, voxels, segmentIndex = 1) {
  const [width, height] = dimensions;
  const data = new Uint8Array(dimensions[0] * dimensions[1] * dimensions[2]);
  voxels.forEach(([i, j, k]) => {
    data[k * width * height + j * width + i] = segmentIndex;
  });
  return data;
}

/** Dense frames of a labelmap. */
const denseFrames =
  (data, [width, height]) =>
  (k) => ({
    data: data.subarray(k * width * height, (k + 1) * width * height),
  });

/** RLE frames of a labelmap, one RLE image voxel manager per frame. */
function rleFrames(data, [width, height, depth]) {
  const maps = [];
  for (let k = 0; k < depth; k++) {
    const voxelManager = utilities.VoxelManager.createRLEImageVoxelManager({
      dimensions: [width, height],
    });
    for (let index = 0; index < width * height; index++) {
      const value = data[k * width * height + index];
      if (value) {
        voxelManager.setAtIndex(index, value);
      }
    }
    maps.push(voxelManager.map);
  }
  return (k) => ({ map: maps[k] });
}

/** The block of one segment, copied from the given frames. */
async function crop(dimensions, getFrame, segmentIndex) {
  const bounds = await findSegmentBounds(dimensions, getFrame, [segmentIndex]);
  if (!bounds.has(segmentIndex)) {
    return undefined;
  }
  const block = getSegmentBlock(bounds.get(segmentIndex), dimensions);
  const scalarData = await cropLabelmapToBlock(
    dimensions,
    getFrame,
    Uint8Array,
    block
  );
  return { ...block, scalarData };
}

describe('cropLabelmapToSegment', () => {
  it('finds no bounds for a segment with no voxels', async () => {
    const data = labelmap([8, 8, 8], [[3, 3, 3]], 2);

    const bounds = await findSegmentBounds(
      [8, 8, 8],
      denseFrames(data, [8, 8]),
      [1]
    );

    expect(bounds.has(1)).toBe(false);
  });

  it('finds the bounds of several segments in one scan', async () => {
    const dimensions = [6, 6, 6];
    const data = labelmap(dimensions, [
      [1, 2, 3],
      [4, 2, 1],
    ]);
    data[5 * 36 + 5 * 6 + 5] = 3;
    data[0] = 9; // not asked for

    const bounds = await findSegmentBounds(
      dimensions,
      denseFrames(data, dimensions),
      [1, 3]
    );

    expect(bounds.get(1)).toEqual({ min: [1, 2, 1], max: [4, 2, 3] });
    expect(bounds.get(3)).toEqual({ min: [5, 5, 5], max: [5, 5, 5] });
    expect(bounds.has(9)).toBe(false);
  });

  it('keeps the segment with one voxel of margin', async () => {
    const data = labelmap(
      [10, 10, 10],
      [
        [3, 4, 5],
        [5, 4, 6],
      ]
    );

    const cropped = await crop([10, 10, 10], denseFrames(data, [10, 10]), 1);

    // i 3..5, j 4..4, k 5..6, each widened by one voxel.
    expect(cropped.dimensions).toEqual([5, 3, 4]);
    expect(cropped.start).toEqual([2, 3, 4]);

    const at = ([i, j, k]) => cropped.scalarData[k * 5 * 3 + j * 5 + i];
    // Source voxels [3,4,5] and [5,4,6] land at [1,1,1] and [3,1,2] in the block.
    expect(at([1, 1, 1])).toBe(1);
    expect(at([3, 1, 2])).toBe(1);
    expect(Array.from(cropped.scalarData).filter(Boolean).length).toBe(2);
  });

  it('clamps the margin to the volume', async () => {
    const data = labelmap(
      [4, 4, 4],
      [
        [0, 0, 0],
        [3, 3, 3],
      ]
    );

    const cropped = await crop([4, 4, 4], denseFrames(data, [4, 4]), 1);

    expect(cropped.dimensions).toEqual([4, 4, 4]);
    expect(cropped.start).toEqual([0, 0, 0]);
    expect(Array.from(cropped.scalarData)).toEqual(Array.from(data));
  });

  it('gives the same block from RLE frames as from dense frames', async () => {
    const dimensions = [9, 7, 5];
    const data = labelmap(dimensions, [
      [2, 1, 1],
      [3, 1, 1],
      [4, 1, 1],
      [6, 5, 3],
    ]);
    // Another segment in a run that crosses the block edge.
    for (let i = 0; i < 9; i++) {
      data[2 * 9 * 7 + 3 * 9 + i] = 2;
    }

    const dense = await crop(dimensions, denseFrames(data, dimensions), 1);
    const rle = await crop(dimensions, rleFrames(data, dimensions), 1);

    expect(rle.dimensions).toEqual(dense.dimensions);
    expect(rle.start).toEqual(dense.start);
    expect(Array.from(rle.scalarData)).toEqual(Array.from(dense.scalarData));
  });
});
