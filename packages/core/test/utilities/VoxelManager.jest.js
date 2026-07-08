import { VoxelManager } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

const dimensions = [64, 128, 4];
const ijkPoint = [4, 2, 2];

describe('VoxelManager', () => {
  it('setAtIJKPoint', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    map.setAtIJKPoint(ijkPoint, ijkPoint);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIJK(...ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(ijkPoint);
  });

  it('setAtIJK', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    map.setAtIJK(...ijkPoint, ijkPoint);
    expect(map.getAtIJK(...ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(ijkPoint);
  });

  it('setAtIndex', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    map.setAtIndex(map.toIndex(ijkPoint), ijkPoint);
    expect(map.getAtIJK(...ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(ijkPoint);
  });

  it('toIJK and toIndex', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    const index = map.toIndex(ijkPoint);
    expect(map.toIJK(index)).toEqual(ijkPoint);
  });

  it('getBoundsIJK', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    map.setAtIJKPoint(ijkPoint, 1);
    const bounds = map.getBoundsIJK();
    expect(bounds).toEqual([
      [4, 4],
      [2, 2],
      [2, 2],
    ]);
  });

  // it('forEach', () => {
  //   const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
  //   map.setAtIJKPoint(ijkPoint, 1);
  //   const points = [];
  //   map.forEach(({ value, index, pointIJK }) => {
  //     points.push({ value, index, pointIJK });
  //   });
  //   expect(points.length).toBe(1);
  //   expect(points[0].value).toBe(1);
  //   expect(points[0].pointIJK).toEqual(ijkPoint);
  // });

  it('clear', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    map.setAtIJKPoint(ijkPoint, 1);
    map.clear();
    expect(map.getAtIJKPoint(ijkPoint)).toBeUndefined();
    expect(map.modifiedSlices.size).toBe(0);
  });

  it('addPoint and getPoints', () => {
    const map = VoxelManager.createMapVoxelManager({ dimension: dimensions });
    map.addPoint(ijkPoint);
    expect(map.getPoints()).toEqual([ijkPoint]);
  });

  it('getSliceData', () => {
    const scalarData = new Uint8Array(
      dimensions[0] * dimensions[1] * dimensions[2]
    );
    const map = VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData,
    });
    map.setAtIJKPoint(ijkPoint, 255);
    const sliceData = map.getSliceData({
      sliceIndex: ijkPoint[2],
      slicePlane: 2,
    });
    expect(sliceData[ijkPoint[0] + ijkPoint[1] * dimensions[0]]).toBe(255);
  });

  it('getSliceData for slicePlane 0, 1, 2', () => {
    const customDimensions = [3, 4, 5];
    const scalarData = new Uint16Array(
      customDimensions[0] * customDimensions[1] * customDimensions[2]
    );
    const map = VoxelManager.createScalarVolumeVoxelManager({
      dimensions: customDimensions,
      scalarData,
    });

    // Fill the entire volume with unique values
    for (let x = 0; x < customDimensions[0]; x++) {
      for (let y = 0; y < customDimensions[1]; y++) {
        for (let z = 0; z < customDimensions[2]; z++) {
          map.setAtIJKPoint([x, y, z], x * 100 + y * 10 + z);
        }
      }
    }

    // Test slicePlane 0 (YZ plane) at x = 1
    const sliceIndex0 = 1;
    const sliceData0 = map.getSliceData({
      sliceIndex: sliceIndex0,
      slicePlane: 0,
    });
    for (let y = 0; y < customDimensions[1]; y++) {
      for (let z = 0; z < customDimensions[2]; z++) {
        expect(sliceData0[y + z * customDimensions[1]]).toBe(
          sliceIndex0 * 100 + y * 10 + z
        );
      }
    }

    // Test slicePlane 1 (XZ plane) at y = 2
    const sliceIndex1 = 2;
    const sliceData1 = map.getSliceData({
      sliceIndex: sliceIndex1,
      slicePlane: 1,
    });
    for (let x = 0; x < customDimensions[0]; x++) {
      for (let z = 0; z < customDimensions[2]; z++) {
        expect(sliceData1[x + z * customDimensions[0]]).toBe(
          x * 100 + sliceIndex1 * 10 + z
        );
      }
    }

    // Test slicePlane 2 (XY plane) at z = 3
    const sliceIndex2 = 3;
    const sliceData2 = map.getSliceData({
      sliceIndex: sliceIndex2,
      slicePlane: 2,
    });
    for (let x = 0; x < customDimensions[0]; x++) {
      for (let y = 0; y < customDimensions[1]; y++) {
        expect(sliceData2[x + y * customDimensions[0]]).toBe(
          x * 100 + y * 10 + sliceIndex2
        );
      }
    }
  });

  // @bill - fix this please
  xit('createImageVolumeVoxelManager', () => {
    const imageIds = ['image1', 'image2', 'image3', 'image4'];
    const mockCache = {
      getImage: jest.fn().mockImplementation((imageId) => ({
        voxelManager: {
          getScalarData: () => new Uint8Array(dimensions[0] * dimensions[1]),
        },
        minPixelValue: 0,
        maxPixelValue: 255,
      })),
    };
    global.cache = mockCache;

    const map = VoxelManager.createImageVolumeVoxelManager({
      dimensions,
      imageIds,
    });
    map.setAtIJKPoint(ijkPoint, 128);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(128);
  });

  // @bill - fix this please
  xit('createHistoryVoxelManager', () => {
    const sourceMap = VoxelManager.createMapVoxelManager({
      dimension: dimensions,
    });
    const historyMap = VoxelManager.createHistoryVoxelManager({
      sourceVoxelManager: sourceMap,
    });

    historyMap.setAtIJKPoint(ijkPoint, 1);
    expect(historyMap.getAtIJKPoint(ijkPoint)).toBe(1);
    expect(sourceMap.getAtIJKPoint(ijkPoint)).toBe(1);

    historyMap.setAtIJKPoint(ijkPoint, 2);
    expect(historyMap.getAtIJKPoint(ijkPoint)).toBe(2);
    expect(sourceMap.getAtIJKPoint(ijkPoint)).toBe(2);
  });

  describe('LazyVoxelManager', () => {
    it('Allocates data as required', () => {
      const map = VoxelManager.createLazyVoxelManager({
        dimensions,
        planeFactory: (width, height) => new Uint16Array(width * height),
      });
      expect(map.map.get(ijkPoint[2])).toBeUndefined();
      map.setAtIJKPoint(ijkPoint, 3);
      expect(map.map.get(ijkPoint[2])).not.toBeUndefined();
    });

    it('sets', () => {
      const map = VoxelManager.createLazyVoxelManager({
        dimensions,
        planeFactory: (width, height) => new Uint8Array(width * height),
      });
      map.setAtIJK(...ijkPoint, 15);
      expect(map.getAtIJK(...ijkPoint)).toBe(15);
      expect(map.getAtIJKPoint(ijkPoint)).toBe(15);
      expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(15);
    });
  });

  it('createRLEVolumeVoxelManager', () => {
    const map = VoxelManager.createRLEVolumeVoxelManager({ dimensions });
    map.setAtIJKPoint(ijkPoint, 1);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(1);
  });

  it('addInstanceToImage', () => {
    const image = {
      width: dimensions[0],
      height: dimensions[1],
      voxelManager: {
        getScalarData: () => new Uint8Array(dimensions[0] * dimensions[1]),
      },
    };
    VoxelManager.addInstanceToImage(image);
    expect(image.voxelManager).toBeInstanceOf(VoxelManager);
  });
});
