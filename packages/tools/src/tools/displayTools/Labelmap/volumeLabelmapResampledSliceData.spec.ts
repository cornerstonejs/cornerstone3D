type TestImageData = {
  spacing: number[];
  direction: number[];
  origin: number[];
};

jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    InterpolationType: {
      NEAREST: 0,
      LINEAR: 1,
    },
  },
  utilities: {
    getEffectiveSpacingAlongDirection: jest.requireActual(
      '@cornerstonejs/core/utilities/getEffectiveSpacingAlongDirection'
    ).default,
    sampleVolumeGrid: jest.requireActual(
      '@cornerstonejs/core/utilities/sampleVolumeGrid'
    ).default,
    transformIndexToWorld: jest.fn(
      (imageData: TestImageData, index: number[]) =>
        [0, 1, 2].map(
          (component) =>
            imageData.origin[component] +
            [0, 1, 2].reduce(
              (sum, axis) =>
                sum +
                index[axis] *
                  imageData.spacing[axis] *
                  imageData.direction[axis * 3 + component],
              0
            )
        )
    ),
    transformWorldToIndexContinuous: jest.fn(
      (imageData: TestImageData, point: number[]) =>
        [0, 1, 2].map(
          (axis) =>
            [0, 1, 2].reduce(
              (sum, component) =>
                sum +
                (point[component] - imageData.origin[component]) *
                  imageData.direction[axis * 3 + component],
              0
            ) / imageData.spacing[axis]
        )
    ),
  },
}));

jest.mock('@kitware/vtk.js/Common/Core/DataArray', () => ({
  __esModule: true,
  default: {
    getDataType: jest.fn(() => 'Uint8Array'),
    newInstance: jest.fn(({ values }) => ({ getData: () => values })),
  },
}));

jest.mock('@kitware/vtk.js/Common/DataModel/ImageData', () => ({
  __esModule: true,
  default: {
    newInstance: jest.fn(() => {
      const state: Record<string, unknown> = {};

      return {
        state,
        set: jest.fn(),
        modified: jest.fn(),
        setDimensions: (...dimensions: number[]) => {
          state.dimensions = dimensions;
        },
        setSpacing: (spacing: number[]) => {
          state.spacing = spacing;
        },
        setDirection: (direction: ArrayLike<number>) => {
          state.direction = Array.from(direction);
        },
        setOrigin: (origin: number[]) => {
          state.origin = origin;
        },
        getPointData: () => ({
          setScalars: (scalars: unknown) => {
            state.scalars = scalars;
          },
        }),
      };
    }),
  },
}));

jest.mock(
  '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport',
  () => ({
    DIRECTION_ALIGNMENT_TOLERANCE: 0.999,
  })
);

import {
  canCreateResampledSliceImageData,
  createPlanarSliceImageData,
  createResampledSliceImageData,
} from './volumeLabelmapResampledSliceData';

const cache = jest.requireActual('@cornerstonejs/core/cache/cache').default;

type Vector = [number, number, number];

type FakeImageState = {
  dimensions: number[];
  spacing: number[];
  direction: number[];
  origin: number[];
  scalars: { getData: () => Uint8Array };
};

type VolumeOptions = {
  dimensions?: Vector;
  spacing?: Vector;
  direction?: number[];
  origin?: Vector;
  getSliceArray?: (
    sliceArrays: Uint8Array[],
    sliceIndex: number
  ) => Uint8Array | undefined;
  hasSliceImage?: (sliceIndex: number) => boolean;
};

type TestVolume = ReturnType<typeof makeVolume>;

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
const obliqueNormal: Vector = [Math.SQRT1_2, 0, Math.SQRT1_2];

/**
 * The value of a voxel of the test volume. Every voxel differs from zero, so a
 * pixel with the value 0 is a pixel outside the volume.
 */
function voxelValue(i: number, j: number, k: number): number {
  return 1 + ((i + 7 * j + 31 * k) % 200);
}

/**
 * Builds a test volume of one typed array per slice. getSliceArray decides
 * which array a slice image exposes, so a test can hide an array as an RLE
 * image does or expose an array of another size. hasSliceImage decides which
 * slice images are in the cache.
 */
function makeVolume(options: VolumeOptions = {}) {
  const {
    dimensions = [6, 5, 4] as Vector,
    spacing = [1, 1, 2] as Vector,
    direction = identityDirection,
    origin = [0, 0, 0] as Vector,
    getSliceArray = (sliceArrays, sliceIndex) => sliceArrays[sliceIndex],
    hasSliceImage = () => true,
  } = options;
  const [columns, rows, slices] = dimensions;
  const sliceArrays = Array.from({ length: slices }, (_, k) => {
    const data = new Uint8Array(columns * rows);

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        data[j * columns + i] = voxelValue(i, j, k);
      }
    }

    return data;
  });

  jest.spyOn(cache, 'getImage').mockImplementation((imageId: string) => {
    const sliceIndex = Number(imageId.split('-')[1]);

    if (!hasSliceImage(sliceIndex)) {
      return;
    }

    return {
      voxelManager: {
        getWritableScalarData: () => getSliceArray(sliceArrays, sliceIndex),
      },
    };
  });

  return {
    dimensions,
    spacing,
    direction,
    imageIds: sliceArrays.map((_, k) => `slice-${k}`),
    imageData: { spacing, direction, origin },
    voxelManager: {
      getConstructor: () => Uint8Array,
      getAtIJK: jest.fn((i: number, j: number, k: number) =>
        hasSliceImage(k) ? sliceArrays[k][j * columns + i] : null
      ),
    },
  };
}

/**
 * The world position of a voxel index of the test volume.
 */
function indexToWorld(volume: TestVolume, index: number[]): Vector {
  const { spacing, direction, origin } = volume.imageData;

  return [0, 1, 2].map(
    (component) =>
      origin[component] +
      [0, 1, 2].reduce(
        (sum, axis) =>
          sum + index[axis] * spacing[axis] * direction[axis * 3 + component],
        0
      )
  ) as Vector;
}

/**
 * The index of the voxel of the test volume that is nearest to a world
 * position. A position on the border between two voxels takes the lower
 * voxel, which is the tie rule of the sampler.
 */
function nearestVoxel(volume: TestVolume, world: number[]): number[] {
  const { spacing, direction, origin } = volume.imageData;

  return [0, 1, 2].map((axis) =>
    Math.floor(
      [0, 1, 2].reduce(
        (sum, component) =>
          sum +
          (world[component] - origin[component]) *
            direction[axis * 3 + component],
        0
      ) /
        spacing[axis] +
        0.5 -
        1e-6
    )
  );
}

/**
 * Turns a vector of the volume axes into a world vector.
 */
function alongVolumeAxes(volume: TestVolume, vector: Vector): Vector {
  const { direction } = volume.imageData;

  return [0, 1, 2].map((component) =>
    [0, 1, 2].reduce(
      (sum, axis) => sum + vector[axis] * direction[axis * 3 + component],
      0
    )
  ) as Vector;
}

/**
 * A world position near the center of the test volume that lies off the
 * borders between voxels. A view plane through the exact center of a volume
 * runs along voxel borders, where two voxels are equally near to a pixel.
 */
function getPointNearCenter(volume: TestVolume): Vector {
  const offsets = [0.27, -0.19, 0.13];

  return indexToWorld(
    volume,
    volume.dimensions.map((size, axis) => (size - 1) / 2 + offsets[axis])
  );
}

/**
 * Builds a viewport that reports the given camera.
 */
function makeViewport(camera: {
  focalPoint: Vector;
  viewPlaneNormal: Vector;
  viewUp: Vector;
}) {
  return {
    getResolvedView: () => ({ toICamera: () => camera }),
  };
}

/**
 * Reads the geometry and the pixels that the code under test gave to the
 * image data.
 */
function getImageState(result: { imageData: unknown }): FakeImageState {
  return (result.imageData as { state: FakeImageState }).state;
}

/**
 * The world position of the center of a pixel of the slice image.
 */
function pixelToWorld(state: FakeImageState, column: number, row: number) {
  return [0, 1, 2].map(
    (axis) =>
      state.origin[axis] +
      column * state.spacing[0] * state.direction[axis] +
      row * state.spacing[1] * state.direction[3 + axis]
  );
}

/**
 * Compares every pixel of the slice image with the nearest voxel of the test
 * volume and returns how many pixels differ and how many lie in the volume.
 * isMissingSlice names the slices whose voxels read as 0.
 */
function comparePixelsWithNearestVoxels(
  volume: TestVolume,
  state: FakeImageState,
  isMissingSlice: (sliceIndex: number) => boolean = () => false
) {
  const [width, height] = state.dimensions;
  const pixels = state.scalars.getData();
  let mismatches = 0;
  let inside = 0;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const [i, j, k] = nearestVoxel(volume, pixelToWorld(state, column, row));
      const isInside =
        i >= 0 &&
        i < volume.dimensions[0] &&
        j >= 0 &&
        j < volume.dimensions[1] &&
        k >= 0 &&
        k < volume.dimensions[2];
      const expected = isInside && !isMissingSlice(k) ? voxelValue(i, j, k) : 0;

      if (isInside) {
        inside++;
      }

      if (pixels[row * width + column] !== expected) {
        mismatches++;
      }
    }
  }

  return { mismatches, inside };
}

/**
 * The determinant of the direction matrix of the slice image.
 */
function directionDeterminant(direction: number[]): number {
  const [a, b, c, d, e, f, g, h, i] = direction;

  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * The distance from the center of a pixel of the slice image to the view
 * plane.
 */
function distanceToViewPlane(
  state: FakeImageState,
  column: number,
  row: number,
  focalPoint: Vector,
  viewPlaneNormal: Vector
): number {
  return pixelToWorld(state, column, row).reduce(
    (sum, value, axis) =>
      sum + (value - focalPoint[axis]) * viewPlaneNormal[axis],
    0
  );
}

describe('createResampledSliceImageData for a view rotated in its own plane', () => {
  const angle = Math.PI / 6;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies one slice of voxels when the view normal follows the slice axis', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: [2.5, 2, 4],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [Math.sin(angle), -Math.cos(angle), 0],
    });

    const result = createResampledSliceImageData(
      volume as never,
      viewport as never
    );
    const state = getImageState(result);
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );

    expect(result.sliceIndex).toBe(2);
    expect(state.dimensions[0] * state.dimensions[1]).toBe(6 * 5);
    expect(inside).toBe(6 * 5);
    expect(mismatches).toBe(0);
    expect(pixelToWorld(state, 0, 0)[2]).toBeCloseTo(4);
  });

  it('copies one slice of voxels when the view normal follows the column axis', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: [3, 2, 3],
      viewPlaneNormal: [1, 0, 0],
      viewUp: [0, Math.sin(angle), Math.cos(angle)],
    });

    const result = createResampledSliceImageData(
      volume as never,
      viewport as never
    );
    const state = getImageState(result);
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );

    expect(result.sliceIndex).toBe(3);
    expect(inside).toBe(5 * 4);
    expect(mismatches).toBe(0);
    expect(pixelToWorld(state, 0, 0)[0]).toBeCloseTo(3);
  });

  it('copies one slice of voxels when the view normal follows the row axis', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: [2.5, 1, 3],
      viewPlaneNormal: [0, -1, 0],
      viewUp: [Math.sin(angle), 0, Math.cos(angle)],
    });

    const result = createResampledSliceImageData(
      volume as never,
      viewport as never
    );
    const state = getImageState(result);
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );

    expect(result.sliceIndex).toBe(1);
    expect(inside).toBe(6 * 4);
    expect(mismatches).toBe(0);
    expect(pixelToWorld(state, 0, 0)[1]).toBeCloseTo(1);
  });

  it('keeps the same handedness for both directions of the view normal', () => {
    [-1, 1].forEach((normalSign) => {
      const volume = makeVolume();
      const viewport = makeViewport({
        focalPoint: [2.5, 2, 4],
        viewPlaneNormal: [0, 0, normalSign],
        viewUp: [Math.sin(angle), -Math.cos(angle), 0],
      });
      const state = getImageState(
        createResampledSliceImageData(volume as never, viewport as never)
      );

      expect(directionDeterminant(state.direction)).toBeCloseTo(-1);
      expect(comparePixelsWithNearestVoxels(volume, state).mismatches).toBe(0);
    });
  });

  it('copies one slice of a volume that is turned and shifted in the world', () => {
    const volume = makeVolume({
      direction: turnedDirection,
      origin: [10, -20, 5],
    });
    const viewport = makeViewport({
      focalPoint: indexToWorld(volume, [2.5, 2, 1]),
      viewPlaneNormal: alongVolumeAxes(volume, [0, 0, -1]),
      viewUp: [0, -1, 0],
    });

    const result = createResampledSliceImageData(
      volume as never,
      viewport as never
    );
    const state = getImageState(result);
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );

    expect(result.sliceIndex).toBe(1);
    expect(inside).toBe(6 * 5);
    expect(mismatches).toBe(0);
  });

  it('copies one slice when the volume axes are not exact unit vectors', () => {
    const volume = makeVolume({
      direction: [0.866025, 0.5, 0, -0.5, 0.866025, 0, 0, 0, 1],
      origin: [10, -20, 5],
    });
    const viewport = makeViewport({
      focalPoint: indexToWorld(volume, [3, 2, 1.5]),
      viewPlaneNormal: [0.866025, 0.5, 0],
      viewUp: [0, Math.sin(angle), Math.cos(angle)],
    });

    const result = createResampledSliceImageData(
      volume as never,
      viewport as never
    );
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      getImageState(result)
    );

    expect(result.sliceIndex).toBe(3);
    expect(inside).toBe(5 * 4);
    expect(mismatches).toBe(0);
  });

  it('returns undefined when the view lies outside the slices', () => {
    const viewport = makeViewport({
      focalPoint: [2.5, 2, 40],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [Math.sin(angle), -Math.cos(angle), 0],
    });

    expect(
      createResampledSliceImageData(makeVolume() as never, viewport as never)
    ).toBeUndefined();
  });
});

describe('createResampledSliceImageData for an oblique view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('takes the nearest voxel for each pixel of the view plane', () => {
    const volume = makeVolume();
    const focalPoint = getPointNearCenter(volume);
    const viewport = makeViewport({
      focalPoint,
      viewPlaneNormal: obliqueNormal,
      viewUp: [0, 1, 0],
    });

    const result = createResampledSliceImageData(
      volume as never,
      viewport as never
    );
    const state = getImageState(result);
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );
    const [width, height] = state.dimensions;

    expect(inside).toBeGreaterThan(0);
    expect(mismatches).toBe(0);
    expect(
      distanceToViewPlane(state, 0, 0, focalPoint, obliqueNormal)
    ).toBeCloseTo(0);
    expect(
      distanceToViewPlane(
        state,
        width - 1,
        height - 1,
        focalPoint,
        obliqueNormal
      )
    ).toBeCloseTo(0);
    expect(directionDeterminant(state.direction)).toBeCloseTo(-1);
  });

  it('accepts a view normal that is not a unit vector', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: getPointNearCenter(volume),
      viewPlaneNormal: [3, 0, 3],
      viewUp: [0, 1, 0],
    });
    const state = getImageState(
      createResampledSliceImageData(volume as never, viewport as never)
    );

    expect(comparePixelsWithNearestVoxels(volume, state).mismatches).toBe(0);
    expect(directionDeterminant(state.direction)).toBeCloseTo(-1);
  });

  it('gives the same slice when the view turns in its own plane', () => {
    const volume = makeVolume();
    const focalPoint = getPointNearCenter(volume);
    const first = getImageState(
      createResampledSliceImageData(
        volume as never,
        makeViewport({
          focalPoint,
          viewPlaneNormal: obliqueNormal,
          viewUp: [0, 1, 0],
        }) as never
      )
    );
    const second = getImageState(
      createResampledSliceImageData(
        volume as never,
        makeViewport({
          focalPoint,
          viewPlaneNormal: obliqueNormal,
          viewUp: [-0.5, Math.SQRT1_2, 0.5],
        }) as never
      )
    );

    expect(second.dimensions).toEqual(first.dimensions);
    expect(Array.from(second.scalars.getData())).toEqual(
      Array.from(first.scalars.getData())
    );
  });

  it('resamples a volume that is turned and shifted in the world', () => {
    const volume = makeVolume({
      direction: turnedDirection,
      origin: [10, -20, 5],
    });
    const focalPoint = getPointNearCenter(volume);
    const viewPlaneNormal = alongVolumeAxes(volume, obliqueNormal);
    const viewport = makeViewport({
      focalPoint,
      viewPlaneNormal,
      viewUp: alongVolumeAxes(volume, [0, 1, 0]),
    });

    const state = getImageState(
      createResampledSliceImageData(volume as never, viewport as never)
    );
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );

    expect(inside).toBeGreaterThan(0);
    expect(mismatches).toBe(0);
    expect(
      distanceToViewPlane(state, 0, 0, focalPoint, viewPlaneNormal)
    ).toBeCloseTo(0);
  });

  it('uses a pixel size close to the voxel size along the plane', () => {
    const volume = makeVolume({
      dimensions: [40, 40, 20],
      spacing: [1, 1, 2],
    });
    const viewport = makeViewport({
      focalPoint: getPointNearCenter(volume),
      viewPlaneNormal: obliqueNormal,
      viewUp: [0, 1, 0],
    });
    const state = getImageState(
      createResampledSliceImageData(volume as never, viewport as never)
    );

    expect(state.spacing[0]).toBeGreaterThan(0.9);
    expect(state.spacing[0]).toBeLessThanOrEqual(1);
    expect(state.spacing[1]).toBeGreaterThan(1);
    expect(state.spacing[1]).toBeLessThan(2);
  });

  it('limits the size of the slice image of a very long volume', () => {
    const volume = makeVolume({
      dimensions: [5000, 2, 2],
      spacing: [1, 1, 1],
    });
    const viewport = makeViewport({
      focalPoint: getPointNearCenter(volume),
      viewPlaneNormal: [0, Math.SQRT1_2, Math.SQRT1_2],
      viewUp: [1, 0, 0],
    });
    const state = getImageState(
      createResampledSliceImageData(volume as never, viewport as never)
    );

    expect(state.dimensions[0]).toBe(2048);
    expect(state.spacing[0]).toBeCloseTo(5000 / 2048);
    expect(comparePixelsWithNearestVoxels(volume, state).mismatches).toBe(0);
  });

  it('samples a view with a small tilt on its own plane and not as one slice of voxels', () => {
    const volume = makeVolume({ dimensions: [60, 50, 40] });
    const focalPoint = getPointNearCenter(volume);
    const tilt = Math.PI / 180;
    const viewPlaneNormal: Vector = [Math.sin(tilt), 0, -Math.cos(tilt)];
    const viewport = makeViewport({
      focalPoint,
      viewPlaneNormal,
      viewUp: [0, -1, 0],
    });

    const state = getImageState(
      createResampledSliceImageData(volume as never, viewport as never)
    );
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      state
    );
    const [width, height] = state.dimensions;

    expect(inside).toBeGreaterThan(0);
    expect(mismatches).toBe(0);
    expect(
      distanceToViewPlane(state, 0, 0, focalPoint, viewPlaneNormal)
    ).toBeCloseTo(0, 6);
    expect(
      distanceToViewPlane(
        state,
        width - 1,
        height - 1,
        focalPoint,
        viewPlaneNormal
      )
    ).toBeCloseTo(0, 6);
  });

  it('keeps its precision for a volume far from the world origin', () => {
    const volume = makeVolume({
      spacing: [0.1, 0.1, 0.2],
      origin: [1e6, -1e6, 1e6],
    });
    const focalPoint = getPointNearCenter(volume);
    const oblique = getImageState(
      createResampledSliceImageData(
        volume as never,
        makeViewport({
          focalPoint,
          viewPlaneNormal: obliqueNormal,
          viewUp: [0, 1, 0],
        }) as never
      )
    );
    const rotated = getImageState(
      createResampledSliceImageData(
        volume as never,
        makeViewport({
          focalPoint: indexToWorld(volume, [2.5, 2, 1]),
          viewPlaneNormal: [0, 0, -1],
          viewUp: [0.5, -Math.sqrt(0.75), 0],
        }) as never
      )
    );
    const rotatedComparison = comparePixelsWithNearestVoxels(volume, rotated);

    expect(comparePixelsWithNearestVoxels(volume, oblique).mismatches).toBe(0);
    expect(rotatedComparison.inside).toBe(6 * 5);
    expect(rotatedComparison.mismatches).toBe(0);
  });

  it('returns undefined when the view plane does not cut the volume', () => {
    const viewport = makeViewport({
      focalPoint: [100, 100, 100],
      viewPlaneNormal: obliqueNormal,
      viewUp: [0, 1, 0],
    });

    expect(
      createResampledSliceImageData(makeVolume() as never, viewport as never)
    ).toBeUndefined();
    expect(
      canCreateResampledSliceImageData(makeVolume() as never, viewport as never)
    ).toBe(false);
  });

  it('returns undefined when the viewport reports no camera', () => {
    const viewport = { getResolvedView: () => undefined };

    expect(
      createResampledSliceImageData(makeVolume() as never, viewport as never)
    ).toBeUndefined();
  });
});

describe('createResampledSliceImageData voxel access', () => {
  /**
   * Resamples the same oblique view of a volume built with the given options.
   */
  function resample(options: VolumeOptions = {}) {
    const volume = makeVolume(options);
    const state = getImageState(
      createResampledSliceImageData(
        volume as never,
        makeViewport({
          focalPoint: getPointNearCenter(volume),
          viewPlaneNormal: obliqueNormal,
          viewUp: [0, 1, 0],
        }) as never
      )
    );

    return { volume, state };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads the slice arrays directly when the slice images expose them', () => {
    const { volume, state } = resample();

    expect(volume.voxelManager.getAtIJK).not.toHaveBeenCalled();
    expect(comparePixelsWithNearestVoxels(volume, state).mismatches).toBe(0);
  });

  it('reads voxels one at a time when the slice images hide their arrays', () => {
    const direct = resample();
    const hidden = resample({ getSliceArray: () => undefined });

    expect(hidden.volume.voxelManager.getAtIJK).toHaveBeenCalled();
    expect(Array.from(hidden.state.scalars.getData())).toEqual(
      Array.from(direct.state.scalars.getData())
    );
  });

  it('reads voxels one at a time for a slice image of another size', () => {
    const direct = resample();
    const otherSize = resample({
      getSliceArray: (sliceArrays, sliceIndex) =>
        sliceIndex === 1 ? new Uint8Array(4) : sliceArrays[sliceIndex],
    });
    const perVoxelSlices = new Set(
      otherSize.volume.voxelManager.getAtIJK.mock.calls.map(
        ([, , sliceIndex]) => sliceIndex
      )
    );

    expect(Array.from(perVoxelSlices)).toEqual([1]);
    expect(Array.from(otherSize.state.scalars.getData())).toEqual(
      Array.from(direct.state.scalars.getData())
    );
  });

  it('leaves the pixels of a slice without an image at 0', () => {
    const { volume, state } = resample({
      hasSliceImage: (sliceIndex) => sliceIndex !== 2,
    });
    const { mismatches } = comparePixelsWithNearestVoxels(
      volume,
      state,
      (sliceIndex) => sliceIndex === 2
    );

    expect(mismatches).toBe(0);
  });
});

describe('createPlanarSliceImageData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies the slice of an aligned view without resampling', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: [2.5, 2, 2],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    });

    const result = createPlanarSliceImageData(
      volume as never,
      viewport as never
    );
    const state = getImageState(result);

    expect(result.sliceIndex).toBe(1);
    expect(state.dimensions).toEqual([6, 5, 1]);
    expect(cache.getImage).not.toHaveBeenCalled();
  });

  it('samples a view with a small tilt that the aligned copy would accept', () => {
    const volume = makeVolume({ dimensions: [60, 50, 40] });
    const focalPoint = getPointNearCenter(volume);
    const tilt = Math.PI / 180;
    const viewPlaneNormal: Vector = [Math.sin(tilt), 0, -Math.cos(tilt)];
    const viewport = makeViewport({
      focalPoint,
      viewPlaneNormal,
      viewUp: [0, -1, 0],
    });

    const state = getImageState(
      createPlanarSliceImageData(volume as never, viewport as never)
    );
    const [width, height] = state.dimensions;

    expect(comparePixelsWithNearestVoxels(volume, state).mismatches).toBe(0);
    expect(
      distanceToViewPlane(
        state,
        width - 1,
        height - 1,
        focalPoint,
        viewPlaneNormal
      )
    ).toBeCloseTo(0, 6);
  });

  it('copies the slice of a view rotated in its own plane', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: [2.5, 2, 2],
      viewPlaneNormal: [0, 0, -1],
      viewUp: [Math.SQRT1_2, -Math.SQRT1_2, 0],
    });

    const result = createPlanarSliceImageData(
      volume as never,
      viewport as never
    );
    const { mismatches, inside } = comparePixelsWithNearestVoxels(
      volume,
      getImageState(result)
    );

    expect(result.sliceIndex).toBe(1);
    expect(inside).toBe(6 * 5);
    expect(mismatches).toBe(0);
  });

  it('resamples the slice of an oblique view', () => {
    const volume = makeVolume();
    const viewport = makeViewport({
      focalPoint: getPointNearCenter(volume),
      viewPlaneNormal: obliqueNormal,
      viewUp: [0, 1, 0],
    });

    const result = createPlanarSliceImageData(
      volume as never,
      viewport as never
    );

    expect(
      comparePixelsWithNearestVoxels(volume, getImageState(result)).mismatches
    ).toBe(0);
    expect(
      canCreateResampledSliceImageData(volume as never, viewport as never)
    ).toBe(true);
  });

  it('returns undefined when the view plane does not cut the volume', () => {
    const viewport = makeViewport({
      focalPoint: [100, 100, 100],
      viewPlaneNormal: obliqueNormal,
      viewUp: [0, 1, 0],
    });

    expect(
      createPlanarSliceImageData(makeVolume() as never, viewport as never)
    ).toBeUndefined();
  });
});
