import { describe, it, expect } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import getEffectiveSpacingAlongDirection from '../src/utilities/getEffectiveSpacingAlongDirection';
import {
  getExactSliceAxis,
  getVolumeSliceGeometry,
} from '../src/utilities/volumeSliceGeometry';

const identityDirection = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const turnedDirection = [
  Math.cos(Math.PI / 6),
  Math.sin(Math.PI / 6),
  0,
  -Math.sin(Math.PI / 6),
  Math.cos(Math.PI / 6),
  0,
  0,
  0,
  1,
];

/**
 * Builds the parts of an image volume that the slice geometry reads.
 */
function makeVolume({
  dimensions = [10, 8, 6],
  spacing = [0.5, 0.5, 2],
  direction = identityDirection,
  origin = [-20, 13, 7],
} = {}) {
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setOrigin(origin);
  imageData.setDirection(direction);

  return { dimensions, spacing, direction, origin, imageData };
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * The world position of the centre of a pixel of the slice.
 */
function pixelToWorld(geometry, column, row) {
  return [0, 1, 2].map(
    (axis) =>
      geometry.origin[axis] +
      column * geometry.spacing[0] * geometry.xDirection[axis] +
      row * geometry.spacing[1] * geometry.yDirection[axis]
  );
}

describe('getVolumeSliceGeometry', () => {
  it('puts a slice along a volume axis on the centre of the nearest slice of voxels', () => {
    const volume = makeVolume();
    const focalPoint = volume.imageData.indexToWorld([4.2, 3.1, 2.3]);
    const geometry = getVolumeSliceGeometry(volume, {
      focalPoint,
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, -1, 0],
    });
    const originIndex = volume.imageData.worldToIndex(geometry.origin);

    expect(geometry.sliceIndex).toBe(2);
    expect(geometry.width).toBe(10);
    expect(geometry.height).toBe(8);
    expect(geometry.spacing).toEqual([0.5, 0.5]);
    expect(originIndex[2]).toBeCloseTo(2, 10);
    expect(originIndex[0]).toBeCloseTo(0, 10);
  });

  it('keeps a slice along a volume axis on the plane of the focal point without snapToSlice', () => {
    const volume = makeVolume({ direction: turnedDirection });
    const focalPoint = volume.imageData.indexToWorld([4.2, 3.1, 2.3]);
    const camera = {
      focalPoint,
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    };
    const snapped = getVolumeSliceGeometry(volume, camera);
    const geometry = getVolumeSliceGeometry(volume, camera, {
      snapToSlice: false,
    });
    const originIndex = volume.imageData.worldToIndex(geometry.origin);

    expect(geometry.sliceIndex).toBe(snapped.sliceIndex);
    expect(geometry.width).toBe(snapped.width);
    expect(geometry.height).toBe(snapped.height);
    expect(geometry.xDirection).toEqual(snapped.xDirection);
    expect(geometry.yDirection).toEqual(snapped.yDirection);
    expect(originIndex[2]).toBeCloseTo(2.3, 10);
    expect(Math.round(originIndex[0] * 1e9) / 1e9).toBe(0);
    expect(
      dot(subtract(geometry.origin, focalPoint), geometry.zDirection)
    ).toBeCloseTo(0, 10);
    expect(
      dot(
        subtract(pixelToWorld(geometry, 9, 7), focalPoint),
        geometry.zDirection
      )
    ).toBeCloseTo(0, 10);
  });

  it('covers the cut of an oblique plane with pixels of about the voxel size', () => {
    const volume = makeVolume({ dimensions: [40, 40, 20] });
    const viewPlaneNormal = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const focalPoint = volume.imageData.indexToWorld([19.3, 18.8, 9.6]);
    const geometry = getVolumeSliceGeometry(volume, {
      focalPoint,
      viewPlaneNormal,
      viewUp: [0, 1, 0],
    });

    expect(geometry.spacing[0]).toBeLessThanOrEqual(
      getEffectiveSpacingAlongDirection(volume, geometry.xDirection) + 1e-12
    );
    expect(geometry.spacing[1]).toBeLessThanOrEqual(
      getEffectiveSpacingAlongDirection(volume, geometry.yDirection) + 1e-12
    );
    expect(
      dot(subtract(geometry.origin, focalPoint), viewPlaneNormal)
    ).toBeCloseTo(0, 10);
    expect(dot(geometry.xDirection, geometry.yDirection)).toBeCloseTo(0, 12);
  });

  it('uses the pixel size that the caller asks for on an oblique plane', () => {
    const volume = makeVolume({ dimensions: [40, 40, 20] });
    const camera = {
      focalPoint: volume.imageData.indexToWorld([19.3, 18.8, 9.6]),
      viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
      viewUp: [0, 1, 0],
    };
    const coarse = getVolumeSliceGeometry(volume, camera);
    const fine = getVolumeSliceGeometry(volume, camera, { pixelSpacing: 0.1 });
    const extentX = coarse.width * coarse.spacing[0];
    const extentY = coarse.height * coarse.spacing[1];

    expect(fine.width).toBe(Math.ceil(extentX / 0.1 - 1e-9));
    expect(fine.height).toBe(Math.ceil(extentY / 0.1 - 1e-9));
    expect(fine.spacing[0]).toBeLessThanOrEqual(0.1);
    expect(fine.spacing[0]).toBeGreaterThan(0.099);
    expect(fine.width * fine.spacing[0]).toBeCloseTo(extentX, 9);
  });

  it('limits the width and the height to maxSize', () => {
    const volume = makeVolume({ dimensions: [40, 40, 20] });
    const geometry = getVolumeSliceGeometry(
      volume,
      {
        focalPoint: volume.imageData.indexToWorld([19.3, 18.8, 9.6]),
        viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
        viewUp: [0, 1, 0],
      },
      { pixelSpacing: 0.001, maxSize: 64 }
    );

    expect(geometry.width).toBe(64);
    expect(geometry.height).toBe(64);
  });

  it('returns undefined when the plane does not cut the volume', () => {
    const volume = makeVolume();

    expect(
      getVolumeSliceGeometry(volume, {
        focalPoint: [500, 500, 500],
        viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
        viewUp: [0, 1, 0],
      })
    ).toBeUndefined();
    expect(
      getVolumeSliceGeometry(volume, {
        focalPoint: [0, 0, 500],
        viewPlaneNormal: [0, 0, 1],
        viewUp: [0, 1, 0],
      })
    ).toBeUndefined();
  });
});

describe('getExactSliceAxis', () => {
  it('finds the volume axis that a view normal follows, of any length', () => {
    const volume = makeVolume({ direction: turnedDirection });

    expect(getExactSliceAxis(volume, [0, 0, -3])).toBe(2);
    expect(getExactSliceAxis(volume, turnedDirection.slice(0, 3))).toBe(0);
    expect(
      getExactSliceAxis(volume, [Math.sin(0.01), 0, Math.cos(0.01)])
    ).toBeUndefined();
  });

  it('finds the slice axis of a volume whose axes are not orthogonal from the plane of the two other axes', () => {
    const length = Math.hypot(0.05, 1);
    const sheared = [1, 0, 0, 0, 1, 0, 0.05 / length, 0, 1 / length];
    const volume = makeVolume({
      dimensions: [8, 8, 6],
      spacing: [1, 1, 1],
      direction: sheared,
    });
    const alongK = sheared.slice(6, 9);
    const acrossIJ = [0, 0, 1];

    expect(getExactSliceAxis(volume, alongK)).toBeUndefined();
    expect(getExactSliceAxis(volume, acrossIJ)).toBe(2);
    expect(getExactSliceAxis(volume, [0, 0, -2])).toBe(2);

    const geometry = getVolumeSliceGeometry(volume, {
      focalPoint: volume.imageData.indexToWorld([3.5, 3.5, 2]),
      viewPlaneNormal: acrossIJ,
      viewUp: [0, -1, 0],
    });

    expect(geometry).toMatchObject({ width: 8, height: 8, sliceIndex: 2 });

    for (const [column, row] of [
      [0, 0],
      [7, 0],
      [0, 7],
      [7, 7],
    ]) {
      const index = volume.imageData.worldToIndex(
        pixelToWorld(geometry, column, row)
      );

      expect(index[2]).toBeCloseTo(2, 9);
    }
  });

  it('cuts a sheared volume along its k axis as an oblique plane', () => {
    const length = Math.hypot(0.05, 1);
    const sheared = [1, 0, 0, 0, 1, 0, 0.05 / length, 0, 1 / length];
    const volume = makeVolume({
      dimensions: [8, 8, 6],
      spacing: [1, 1, 1],
      direction: sheared,
    });
    const viewPlaneNormal = sheared.slice(6, 9);
    const focalPoint = volume.imageData.indexToWorld([3.5, 3.5, 2]);
    const geometry = getVolumeSliceGeometry(volume, {
      focalPoint,
      viewPlaneNormal,
      viewUp: [0, -1, 0],
    });
    const values = [
      ...geometry.origin,
      ...geometry.xDirection,
      ...geometry.yDirection,
      ...geometry.spacing,
    ];

    expect(values.every(Number.isFinite)).toBe(true);
    expect(dot(geometry.xDirection, viewPlaneNormal)).toBeCloseTo(0, 9);
    expect(dot(geometry.yDirection, viewPlaneNormal)).toBeCloseTo(0, 9);
    expect(
      dot(subtract(geometry.origin, focalPoint), viewPlaneNormal)
    ).toBeCloseTo(0, 9);

    const corners = [
      volume.imageData.worldToIndex(pixelToWorld(geometry, 0, 0)),
      volume.imageData.worldToIndex(
        pixelToWorld(geometry, geometry.width - 1, 0)
      ),
    ];

    expect(Math.abs(corners[0][2] - corners[1][2])).toBeGreaterThan(0.01);
  });

  it('gives the same axis as before for a volume whose axes are at right angles', () => {
    const volume = makeVolume({ direction: turnedDirection });
    const tilt = 1e-5;

    expect(getExactSliceAxis(volume, [0, Math.sin(tilt), Math.cos(tilt)])).toBe(
      2
    );
    expect(getExactSliceAxis(volume, turnedDirection.slice(3, 6))).toBe(1);
    expect(
      getExactSliceAxis(volume, [Math.sin(1e-3), 0, Math.cos(1e-3)])
    ).toBeUndefined();
  });
});
