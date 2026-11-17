jest.mock(
  '../../stateManagement/segmentation/triggerSegmentationEvents',
  () => ({
    triggerSegmentationDataModified: jest.fn(),
  })
);

import type { Types } from '@cornerstonejs/core';
import thresholdVolumeByRange from './thresholdVolumeByRange';

describe('thresholdVolumeByRange', () => {
  it('tests only the voxels of forEachVoxel, and writes through writeVoxelManager', () => {
    // A 4-voxel PT volume, with the same size as the segmentation.
    const ptValues = [5, 5, 0, 5];
    const ptVolume = {
      spacing: [1, 1, 1],
      voxelManager: { getScalarDataLength: () => 4 },
      imageData: {
        get: () => ({
          voxelManager: {
            toIndex: (ijk: Types.Point3) => ijk[0],
            getAtIndex: (index: number) => ptValues[index],
          },
        }),
      },
    };
    const segmentationVolume = {
      spacing: [1, 1, 1],
      imageData: {},
      voxelManager: { getScalarDataLength: () => 4, forEach: jest.fn() },
    } as unknown as Types.IImageVolume;
    const writes: number[][] = [];
    const writeVoxelManager = {
      setAtIndex: (index: number, value: number) => writes.push([index, value]),
    } as unknown as Types.IVoxelManager<number>;

    thresholdVolumeByRange(
      segmentationVolume,
      [{ volume: ptVolume as never, lower: 1, upper: 10 }],
      {
        overwrite: false,
        segmentationId: 'seg',
        segmentIndex: 2,
        writeVoxelManager,
        // Voxel 1 passes the range, but it is not in the region.
        forEachVoxel: (callback) =>
          [0, 2, 3].forEach((index) =>
            callback({
              index,
              pointIJK: [index, 0, 0],
              pointLPS: [index, 0, 0],
            })
          ),
      }
    );

    expect(writes).toEqual([
      [0, 2],
      [3, 2],
    ]);
    expect(segmentationVolume.voxelManager.forEach).not.toHaveBeenCalled();
  });
});
