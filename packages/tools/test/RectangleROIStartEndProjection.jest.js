import { metaData } from '@cornerstonejs/core';
import RectangleROIStartEndThresholdTool from '../src/tools/segmentation/RectangleROIStartEndThresholdTool';

describe('RectangleROIStartEndThresholdTool projection points', () => {
  // Axial volume with 1 mm in-plane spacing and 2 mm slice spacing, no
  // rotation, so voxel (i, j, k) sits at world (i, j, 2k).
  const sliceSpacing = 2;
  // One image per slice: image k is at z = 2k, so ids run from z 0 to z 40.
  const imageIds = Array.from({ length: 21 }, (_, k) => `image:${k}`);
  const imageVolume = {
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    spacing: [1, 1, sliceSpacing],
    imageIds,
    imageData: {
      worldToIndex: ([x, y, z]) => [x, y, z / sliceSpacing],
      indexToWorldVec3: ([i, j, k], out) => {
        out[0] = i;
        out[1] = j;
        out[2] = k * sliceSpacing;
        return out;
      },
    },
  };

  const imagePlaneProvider = (type, imageId) => {
    if (type !== 'imagePlaneModule' || !imageId?.startsWith('image:')) {
      return;
    }
    const k = Number(imageId.slice('image:'.length));
    return { imagePositionPatient: [0, 0, k * sliceSpacing] };
  };

  beforeAll(() => {
    metaData.addProvider(imagePlaneProvider, 10000);
  });

  afterAll(() => {
    metaData.removeProvider(imagePlaneProvider);
  });

  function createAnnotation(
    startCoordinate,
    endCoordinate,
    spacingInNormal = sliceSpacing
  ) {
    // The handles are drawn on the start slice.
    return {
      metadata: {
        viewPlaneNormal: [0, 0, 1],
        spacingInNormal,
      },
      data: {
        startCoordinate,
        endCoordinate,
        cachedStats: { projectionPoints: [] },
        handles: {
          points: [
            [10, 10, startCoordinate],
            [20, 10, startCoordinate],
            [10, 20, startCoordinate],
            [20, 20, startCoordinate],
          ],
        },
      },
    };
  }

  function getSliceCoordinates(annotation) {
    const tool = new RectangleROIStartEndThresholdTool();
    tool._computeProjectionPoints(annotation, imageVolume);

    return annotation.data.cachedStats.projectionPoints.map((slice) => {
      // Every corner of a projected rectangle lies on the same slice.
      const zs = new Set(slice.map((point) => point[2]));
      expect(zs.size).toBe(1);
      return slice[0][2];
    });
  }

  it('includes the start and end slices when the end is after the start', () => {
    expect(getSliceCoordinates(createAnnotation(10, 20))).toEqual([
      10, 12, 14, 16, 18, 20,
    ]);
  });

  it('includes the start and end slices when the end is before the start', () => {
    expect(getSliceCoordinates(createAnnotation(20, 10))).toEqual([
      20, 18, 16, 14, 12, 10,
    ]);
  });

  it('keeps one projected rectangle when the start and end slices match', () => {
    expect(getSliceCoordinates(createAnnotation(10, 10))).toEqual([10]);
  });

  it('includes the end slice when float32 rounding shortens the distance', () => {
    // _getEndCoordinate builds the end position in a float32 vec3, so an end
    // coordinate of 1001.3 is stored as 1001.2999877929688, about 1.2e-5 short
    // of one 1.3 mm step from 1000.
    for (const endCoordinate of [1001.3, Math.fround(1001.3)]) {
      const slices = getSliceCoordinates(
        createAnnotation(1000, endCoordinate, 1.3)
      );
      expect(slices).toHaveLength(2);
      expect(slices[0]).toBe(1000);
      expect(slices[1]).toBeCloseTo(1001.3, 3);
    }
  });

  it('includes the end slice far from the origin with a small spacing', () => {
    // Float32 error grows with the coordinate: 10000 + 0.1 is stored as
    // 10000.099609375, about 3.9e-4 short of one 0.1 mm step.
    for (const endCoordinate of [10000.1, Math.fround(10000.1)]) {
      const slices = getSliceCoordinates(
        createAnnotation(10000, endCoordinate, 0.1)
      );
      expect(slices).toHaveLength(2);
      expect(slices[0]).toBe(10000);
      expect(slices[1]).toBeCloseTo(10000.1, 2);
    }
  });

  it('stores one image id per projection for contour export', () => {
    const annotation = createAnnotation(10, 14);
    const tool = new RectangleROIStartEndThresholdTool();
    tool._computeProjectionPoints(annotation, imageVolume);

    expect(annotation.data.cachedStats.projectionPointsImageIds).toEqual([
      'image:5',
      'image:6',
      'image:7',
    ]);
  });
});
