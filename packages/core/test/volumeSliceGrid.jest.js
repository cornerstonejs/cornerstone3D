jest.mock('../src/metaData', () => ({
  addProvider: jest.fn(),
  get: jest.fn(),
}));
jest.mock('../src/utilities/getVolumeSliceRangeInfo', () => jest.fn());

import { vec3 } from 'gl-matrix';
import { OrientationAxis } from '../src/enums';
import { getConfiguration, setConfiguration } from '../src/init';
import { createPlanarVolumeSliceBasis } from '../src/RenderingEngine/GenericViewport/Planar/planarSliceBasis';
import { getVolumeCenterIJK } from '../src/RenderingEngine/Viewport';
import getVolumeSliceRangeInfo from '../src/utilities/getVolumeSliceRangeInfo';
import getVolumeViewportScrollInfo from '../src/utilities/getVolumeViewportScrollInfo';
import { getSliceStep } from '../src/utilities/getVolumeSliceGrid';
import snapFocalPointToSlice from '../src/utilities/snapFocalPointToSlice';

// Axis-aligned volume: 10 x 8 x 6 voxels, spacing [0.5, 1, 2], origin
// [100, 200, 300]. An oblique view uses an oblique normal on this volume.
const dimensions = [10, 8, 6];
const spacing = [0.5, 1, 2];
const direction = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const origin = [100, 200, 300];
const indexToWorld = (ijk, out = []) => {
  for (let i = 0; i < 3; i++) {
    out[i] = origin[i] + ijk[i] * spacing[i];
  }
  return out;
};
const imageVolume = {
  dimensions,
  direction,
  spacing,
  imageData: {
    getDimensions: () => dimensions,
    getDirection: () => direction,
    getSpacing: () => spacing,
    getExtent: () => [0, 9, 0, 7, 0, 5],
    extentToBounds: () => [100, 104.5, 200, 207, 300, 310],
    getSpatialExtent: () => [-0.5, 9.5, -0.5, 7.5, -0.5, 5.5],
    indexToWorld,
  },
};

const rad = (deg) => (deg * Math.PI) / 180;
// Normals rotated about Y (viewUp stays [0, 1, 0]), and one tilted about X too.
const obliqueOrientations = [20, 30, 37, 45, 60].map((deg) => ({
  viewPlaneNormal: [Math.sin(rad(deg)), 0, -Math.cos(rad(deg))],
  viewUp: [0, 1, 0],
}));
const tilt = vec3.normalize([], [0.3, 0.4, -0.866]);
obliqueOrientations.push({
  viewPlaneNormal: tilt,
  viewUp: vec3.normalize([], vec3.cross([], tilt, [1, 0, 0])),
});

// The planar slice basis holds float32 points.
const TOLERANCE = 1e-4;
const PRECISION = 4;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function slice(orientation, imageIdIndex) {
  return createPlanarVolumeSliceBasis({
    canvasWidth: 256,
    canvasHeight: 256,
    imageVolume,
    orientation,
    imageIdIndex,
  });
}

// Depths of every slice plane, from the planar API.
function sliceDepths(orientation) {
  const { maxImageIdIndex } = slice(orientation, 0);
  return Array.from({ length: maxImageIdIndex + 1 }, (_, k) =>
    dot(
      slice(orientation, k).sliceBasis.sliceCenterWorld,
      orientation.viewPlaneNormal
    )
  );
}

// Projections of all voxel centres onto the normal.
function voxelCentreDepths(normal) {
  const depths = [];
  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        depths.push(dot(indexToWorld([i, j, k]), normal));
      }
    }
  }
  return depths;
}

function sliceRangeOf(normal, focalPoint) {
  const depths = voxelCentreDepths(normal);
  return {
    min: Math.min(...depths),
    max: Math.max(...depths),
    current: dot(focalPoint, normal),
  };
}

describe('volume slice grid (volume slice navigation spec)', () => {
  it.each(obliqueOrientations)(
    'cuts each voxel with exactly one slice plane for an oblique normal (VSN-U-1)',
    (orientation) => {
      const normal = orientation.viewPlaneNormal;
      const step = getSliceStep(imageVolume, normal);
      const planes = sliceDepths(orientation);

      // A voxel box spans `step` along the normal for the L1 step.
      voxelCentreDepths(normal).forEach((centre) => {
        const cuts = planes.filter(
          (d) => Math.abs(d - centre) < step / 2 - TOLERANCE
        );
        const touches = planes.filter(
          (d) => Math.abs(d - centre) <= step / 2 + TOLERANCE
        );
        expect(cuts.length).toBeLessThanOrEqual(1);
        expect(touches.length).toBeGreaterThanOrEqual(1);
      });
    }
  );

  it.each(obliqueOrientations)(
    'puts the first and the last slice at the same distance from the centre (VSN-U-5)',
    (orientation) => {
      const planes = sliceDepths(orientation);
      const { min, max } = sliceRangeOf(orientation.viewPlaneNormal, origin);

      expect((planes[0] + planes[planes.length - 1]) / 2).toBeCloseTo(
        (min + max) / 2,
        PRECISION
      );
    }
  );

  it.each([...obliqueOrientations, OrientationAxis.AXIAL])(
    'gives the same index and depth in the planar and the legacy viewport (VSN-I-4)',
    (orientationOrAxis) => {
      const orientation =
        typeof orientationOrAxis === 'string'
          ? { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0] }
          : orientationOrAxis;
      const normal = orientation.viewPlaneNormal;
      const step = getSliceStep(imageVolume, normal);
      const opened = slice(orientationOrAxis);

      // Legacy resetCamera: the focal point from getVolumeCenterIJK.
      const resetFocalPoint = indexToWorld(
        getVolumeCenterIJK(dimensions, direction, normal, spacing)
      );
      const camera = {
        focalPoint: resetFocalPoint,
        position: vec3.scaleAndAdd([], resetFocalPoint, normal, 100),
        viewPlaneNormal: normal,
      };
      const sliceRange = sliceRangeOf(normal, resetFocalPoint);
      getVolumeSliceRangeInfo.mockReturnValue({
        sliceRange,
        spacingInNormalDirection: step,
        camera,
      });

      // The initial slice is the same.
      expect(getVolumeViewportScrollInfo({}, 'volume').currentStepIndex).toBe(
        opened.currentImageIdIndex
      );
      expect(sliceRange.current).toBeCloseTo(
        dot(opened.sliceBasis.sliceCenterWorld, normal),
        PRECISION
      );

      // Every slice that the legacy scroll reaches is the planar slice.
      for (let k = 0; k <= opened.maxImageIdIndex; k++) {
        const { newFocalPoint } = snapFocalPointToSlice(
          camera.focalPoint,
          camera.position,
          sliceRange,
          normal,
          step,
          k - opened.currentImageIdIndex
        );
        expect(dot(newFocalPoint, normal)).toBeCloseTo(
          dot(slice(orientation, k).sliceBasis.sliceCenterWorld, normal),
          PRECISION
        );
      }
    }
  );

  it('opens an even-count axial volume on view index floor(N / 2) in both viewports', () => {
    const normal = [0, 0, -1];
    const resetFocalPoint = indexToWorld(
      getVolumeCenterIJK(dimensions, direction, normal, spacing)
    );
    const opened = slice(OrientationAxis.AXIAL);

    // N = 6 along the normal, which points against the k axis: view index 3
    // is k = 2, z = 304.
    expect(opened.currentImageIdIndex).toBe(3);
    expect(resetFocalPoint[2]).toBeCloseTo(304, PRECISION);
    expect(opened.sliceBasis.sliceCenterWorld[2]).toBeCloseTo(304, PRECISION);
  });

  describe('for an axis-aligned normal (VSN-I-5)', () => {
    const measure = getConfiguration().rendering.sliceStepMeasure;
    afterEach(() => {
      setConfiguration({
        ...getConfiguration(),
        rendering: {
          ...getConfiguration().rendering,
          sliceStepMeasure: measure,
        },
      });
    });

    it.each([
      ['l1', OrientationAxis.AXIAL, [300, 302, 304, 306, 308, 310].reverse()],
      ['l2', OrientationAxis.AXIAL, [300, 302, 304, 306, 308, 310].reverse()],
      [
        'l1',
        OrientationAxis.CORONAL,
        [200, 201, 202, 203, 204, 205, 206, 207].reverse(),
      ],
    ])(
      'puts the %s slices of %s on the acquired voxel centres',
      (sliceStepMeasure, orientation, expected) => {
        setConfiguration({
          ...getConfiguration(),
          rendering: { ...getConfiguration().rendering, sliceStepMeasure },
        });
        const axis = orientation === OrientationAxis.AXIAL ? 2 : 1;
        const { maxImageIdIndex } = slice(orientation, 0);

        expect(maxImageIdIndex).toBe(expected.length - 1);
        expected.forEach((depth, k) => {
          expect(
            slice(orientation, k).sliceBasis.sliceCenterWorld[axis]
          ).toBeCloseTo(depth, PRECISION);
        });
      }
    );
  });
});
