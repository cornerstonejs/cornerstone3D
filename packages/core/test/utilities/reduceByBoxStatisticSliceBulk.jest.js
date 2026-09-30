import { describe, it, expect } from '@jest/globals';
import { reduceByBoxStatistic } from '../../src/utilities/voxelGrid/boxStatistic';
import VoxelManager from '../../src/utilities/VoxelManager';

describe('reduceByBoxStatistic slice-bulk k path', () => {
  it('averages two XY slices with factors [1,1,2] via getSliceData', () => {
    const width = 4;
    const height = 4;
    const depth = 2;
    const plane = width * height;
    const scalarData = new Uint16Array(plane * depth);

    for (let i = 0; i < plane; i++) {
      scalarData[i] = 10;
      scalarData[plane + i] = 30;
    }

    const source = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, depth],
      scalarData,
      numberOfComponents: 1,
    });

    const target = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, 1],
      scalarData: new Uint16Array(plane),
      numberOfComponents: 1,
    });

    const written = reduceByBoxStatistic(
      source,
      {
        factors: [1, 1, 2],
        sourceOffset: [0, 0, 0],
        sourceDimensions: [width, height, depth],
        targetOffset: [0, 0, 0],
      },
      target,
      { round: true }
    );

    expect(written).toBe(plane);
    expect(target.getAtIJK(0, 0, 0)).toBe(20);
    expect(target.getAtIJK(3, 3, 0)).toBe(20);
  });

  it('averages only present slices when one k is missing (_getSliceData)', () => {
    const width = 2;
    const height = 2;
    const scalar0 = new Uint16Array(4).fill(40);

    // Only slice 0 in cache — simulate via a custom source with _getSliceData
    const source = {
      dimensions: [width, height, 2],
      getAtIJK: () => undefined,
      _getSliceData: ({ sliceIndex }) =>
        sliceIndex === 0 ? scalar0 : undefined,
    };

    const target = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: [width, height, 1],
      scalarData: new Uint16Array(4),
      numberOfComponents: 1,
    });

    reduceByBoxStatistic(
      source,
      {
        factors: [1, 1, 2],
        sourceOffset: [0, 0, 0],
        sourceDimensions: [width, height, 2],
        targetOffset: [0, 0, 0],
      },
      target,
      { round: true }
    );

    expect(target.getAtIJK(0, 0, 0)).toBe(40);
  });
});
