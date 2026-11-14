jest.mock('@cornerstonejs/core', () => ({
  utilities: {},
}));

jest.mock('@kitware/vtk.js/Common/Core/DataArray', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('@kitware/vtk.js/Common/DataModel/ImageData', () => ({
  __esModule: true,
  default: {},
}));

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    DIRECTION_ALIGNMENT_TOLERANCE: 0.999,
  })
);

import { applyPlanarOverlayDepthOffset } from './volumeLabelmapSliceData';

const DEPTH_STEP = 1e-4;

type Point3 = [number, number, number];

type Camera = {
  focalPoint: Point3;
  viewPlaneNormal: Point3;
};

/**
 * Places a slice whose image has the given centre, and returns how far the
 * placed slice is from the view plane, in mm toward the camera.
 */
function placeSlice(
  sliceCenter: Point3,
  camera: Camera,
  overlayOrder: number
): number {
  const actor = { setPosition: jest.fn() };
  const imageData = { getCenter: () => sliceCenter };

  applyPlanarOverlayDepthOffset(
    actor as never,
    imageData as never,
    camera as never,
    overlayOrder
  );

  const [position] = actor.setPosition.mock.calls;
  const { focalPoint, viewPlaneNormal } = camera;
  const normalLength = Math.hypot(...viewPlaneNormal);

  return (
    [0, 1, 2].reduce(
      (sum, axis) =>
        sum +
        (sliceCenter[axis] + position[axis] - focalPoint[axis]) *
          viewPlaneNormal[axis],
      0
    ) / normalLength
  );
}

describe('applyPlanarOverlayDepthOffset', () => {
  const axialCamera: Camera = {
    focalPoint: [-0.49, -0.49, -473.35],
    viewPlaneNormal: [0, 0, -1],
  };

  it('brings a slice that lies behind the view plane one step in front of it', () => {
    const depth = placeSlice([2.34, 2.34, -473.34], axialCamera, 1);

    expect(depth).toBeCloseTo(DEPTH_STEP, 9);
  });

  it('brings a slice that lies far in front of the view plane back to one step in front of it', () => {
    const coronalCamera: Camera = {
      focalPoint: [-0.49, -0.49, -473.35],
      viewPlaneNormal: [0, -1, 0],
    };
    const depth = placeSlice([2.34, -2.34, -471.7], coronalCamera, 1);

    expect(depth).toBeCloseTo(DEPTH_STEP, 9);
  });

  it('keeps a slice of a later depth order one step nearer to the camera', () => {
    const sliceCenter: Point3 = [2.34, 2.34, -473.34];
    const afterOneSlice = placeSlice(sliceCenter, axialCamera, 1);
    const afterTwoSlices = placeSlice(sliceCenter, axialCamera, 2);

    expect(afterTwoSlices - afterOneSlice).toBeCloseTo(DEPTH_STEP, 9);
  });

  it('puts a slice of depth order 0 on the view plane', () => {
    const depth = placeSlice([2.34, 2.34, -471.2], axialCamera, 0);

    expect(depth).toBeCloseTo(0, 9);
  });

  it('accepts an oblique view normal that is not of unit length', () => {
    const obliqueCamera: Camera = {
      focalPoint: [12, -40, 310],
      viewPlaneNormal: [0, 3, 4],
    };
    const depth = placeSlice([15, -42.5, 311.25], obliqueCamera, 2);

    expect(depth).toBeCloseTo(2 * DEPTH_STEP, 9);
  });

  it('moves the slice along the view normal only', () => {
    const actor = { setPosition: jest.fn() };
    const imageData = { getCenter: () => [2.34, 2.34, -473.34] };

    applyPlanarOverlayDepthOffset(
      actor as never,
      imageData as never,
      axialCamera as never,
      1
    );

    const [[x, y, z]] = actor.setPosition.mock.calls;

    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(-0.0101, 9);
  });
});
