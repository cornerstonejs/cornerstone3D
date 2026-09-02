import { sampleVoxelsInSlab } from '../src/utilities/voxelSlab/sampleVoxelsInSlab';
import { collectVoxelsInSlab } from '../src/utilities/voxelSlab/iterateVoxelsInSlab';

/**
 * `sampleVoxelsInSlab` is the accumulation half of an area measurement, shared
 * by every ROI tool. Which voxels it visits is `iterateVoxelsInSlab`'s job and
 * is covered exhaustively against a brute force oracle in
 * `voxelSlabIterator.jest.js`; what matters here is the reading contract laid
 * over it - values, copies, the callback, and what a missing value does.
 */

const volume = {
  dimensions: [8, 8, 8],
  direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  spacing: [1, 1, 1],
  origin: [0, 0, 0],
};

const planePoint = [0, 0, 0];
const normal = [0, 0, 1];

/** The z = 0 layer, 64 voxels, with every value distinct and non-zero. */
const iteration = {
  volume,
  planePoint,
  normal,
  annotationThickness: 1,
};

const voxelManager = {
  getAtIJKPoint: ([i, j, k]) => i + j * 8 + k * 64 + 1,
};

describe('sampleVoxelsInSlab', () => {
  it('reads a value for every voxel the iterator visits', () => {
    const expected = collectVoxelsInSlab(iteration);

    const samples = sampleVoxelsInSlab({
      ...iteration,
      voxelManager,
      storePointData: true,
    });

    expect(samples).toHaveLength(expected.length);
    expect(samples.map(({ pointIJK }) => pointIJK)).toEqual(expected);
    expect(
      samples.every(
        ({ value, pointIJK }) => value === voxelManager.getAtIJKPoint(pointIJK)
      )
    ).toBe(true);
  });

  it('calls onSample for every voxel whether or not point data is stored', () => {
    const stored = jest.fn();
    const notStored = jest.fn();

    const withData = sampleVoxelsInSlab({
      ...iteration,
      voxelManager,
      onSample: stored,
      storePointData: true,
    });
    const withoutData = sampleVoxelsInSlab({
      ...iteration,
      voxelManager,
      onSample: notStored,
    });

    expect(withData).toHaveLength(64);
    expect(withoutData).toHaveLength(0);
    expect(stored).toHaveBeenCalledTimes(64);
    expect(notStored).toHaveBeenCalledTimes(64);
  });

  it('skips voxels the volume has no value for', () => {
    const onSample = jest.fn();

    const samples = sampleVoxelsInSlab({
      ...iteration,
      voxelManager: {
        // Half the layer is missing; 0 is a value and must survive.
        getAtIJKPoint: ([i]) => (i < 4 ? 0 : undefined),
      },
      onSample,
      storePointData: true,
    });

    expect(samples).toHaveLength(32);
    expect(samples.every(({ value }) => value === 0)).toBe(true);
    expect(onSample).toHaveBeenCalledTimes(32);
  });

  it('returns copies, not the arrays the iterator reuses', () => {
    const samples = sampleVoxelsInSlab({
      ...iteration,
      voxelManager,
      storePointData: true,
    });

    const indices = new Set(samples.map(({ pointIJK }) => pointIJK.join(',')));
    const centres = new Set(samples.map(({ pointLPS }) => pointLPS.join(',')));

    expect(indices.size).toBe(samples.length);
    expect(centres.size).toBe(samples.length);
  });

  it('returns nothing without a voxel manager', () => {
    expect(
      sampleVoxelsInSlab({ ...iteration, voxelManager: null })
    ).toHaveLength(0);
  });
});
