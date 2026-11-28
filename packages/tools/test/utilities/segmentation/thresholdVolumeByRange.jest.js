import { cache, volumeLoader } from '@cornerstonejs/core';
import { describe, it, expect, beforeEach } from '@jest/globals';
import thresholdVolumeByRange from '../../../src/utilities/segmentation/thresholdVolumeByRange';

// Patient coordinates: non-zero origin and non-unit spacing.
const origin = [-120.5, 35.25, 12];
const spacing = [0.7, 0.7, 2.5];
const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// One row of CT values, so the voxel index is the position in this array.
const ctValues = [-1000, 99, 100, 150, 200, 201, 3000, 100];
const dimensions = [ctValues.length, 1, 1];

let volumeCount = 0;

function createVolume(scalarData, volumeOptions = {}) {
  volumeCount++;
  return volumeLoader.createLocalVolume(`thresholdVolume${volumeCount}`, {
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
    ...volumeOptions,
  });
}

function createSegmentationVolume() {
  return createVolume(new Uint8Array(ctValues.length));
}

function threshold(segmentationVolume, volume, lower, upper) {
  thresholdVolumeByRange(segmentationVolume, [{ volume, lower, upper }], {
    overwrite: true,
    segmentationId: 'thresholdSegmentation',
    segmentIndex: 2,
    boundsIJK: [
      [0, segmentationVolume.dimensions[0] - 1],
      [0, segmentationVolume.dimensions[1] - 1],
      [0, segmentationVolume.dimensions[2] - 1],
    ],
  });
  return Array.from(
    segmentationVolume.voxelManager.getCompleteScalarDataArray()
  );
}

describe('thresholdVolumeByRange', () => {
  beforeEach(() => {
    cache.purgeCache();
  });

  it('includes voxels equal to lower and upper for a volume on the segmentation grid', () => {
    const ctVolume = createVolume(new Float32Array(ctValues));
    const segmentationVolume = createSegmentationVolume();

    const result = threshold(segmentationVolume, ctVolume, 100, 200);

    // [-1000, 99, 100, 150, 200, 201, 3000, 100]
    expect(result).toEqual([0, 0, 2, 2, 2, 0, 0, 2]);
  });

  it('selects the voxels of a single value range on the segmentation grid', () => {
    const maskVolume = createVolume(new Uint8Array([0, 1, 1, 0, 2, 1, 0, 0]));
    const segmentationVolume = createSegmentationVolume();

    const result = threshold(segmentationVolume, maskVolume, 1, 1);

    expect(result).toEqual([0, 2, 2, 0, 0, 2, 0, 0]);
  });

  it('includes lower and upper for a volume on a different grid, as before', () => {
    // A 2 x 1 x 1 volume with voxels four times as wide covers the same extent
    // as the 8 x 1 x 1 segmentation. It is not on the segmentation grid, so it
    // is tested through voxel overlaps. Both of its values are a bound.
    const coarseVolume = createVolume(new Float32Array([100, 200]), {
      dimensions: [2, 1, 1],
      spacing: [spacing[0] * 4, spacing[1], spacing[2]],
      origin: [origin[0] + spacing[0] * 1.5, origin[1], origin[2]],
    });
    // The CT volume on the segmentation grid is the base volume, whose
    // spacing gives the size of a segmentation voxel for the overlaps.
    const ctVolume = createVolume(new Float32Array(ctValues));
    const segmentationVolume = createSegmentationVolume();

    thresholdVolumeByRange(
      segmentationVolume,
      [
        { volume: ctVolume, lower: -Infinity, upper: Infinity },
        { volume: coarseVolume, lower: 100, upper: 200 },
      ],
      {
        overwrite: true,
        segmentationId: 'thresholdSegmentation',
        segmentIndex: 2,
        overlapType: 1,
        boundsIJK: [
          [0, dimensions[0] - 1],
          [0, 0],
          [0, 0],
        ],
      }
    );

    expect(
      Array.from(segmentationVolume.voxelManager.getCompleteScalarDataArray())
    ).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it('does not select NaN voxels on the segmentation grid', () => {
    const ptVolume = createVolume(
      new Float32Array([NaN, 2.5, NaN, 4, 0, NaN, 3, 1])
    );

    expect(threshold(createSegmentationVolume(), ptVolume, 2, 5)).toEqual([
      0, 2, 0, 2, 0, 0, 2, 0,
    ]);
  });

  it('keeps fractional bounds, values outside the range and an empty range', () => {
    const ctVolume = createVolume(new Float32Array(ctValues));

    expect(
      threshold(createSegmentationVolume(), ctVolume, 99.5, 200.5)
    ).toEqual([0, 0, 2, 2, 2, 0, 0, 2]);
    expect(threshold(createSegmentationVolume(), ctVolume, -999, 98)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(threshold(createSegmentationVolume(), ctVolume, 201, 150)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(
      threshold(createSegmentationVolume(), ctVolume, -Infinity, Infinity)
    ).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });
});
