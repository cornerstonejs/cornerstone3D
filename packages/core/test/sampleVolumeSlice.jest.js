import { describe, it, expect, jest, afterEach } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import { BlendModes, InterpolationType } from '../src/enums';
import sampleVolumeSlice, {
  getSlabSampleOffsets,
  getVolumeSliceArrayType,
} from '../src/utilities/sampleVolumeSlice';
import * as sampleVolumeGridModule from '../src/utilities/sampleVolumeGrid';
import sampleVolumeGrid, {
  isIndexInsideVolume,
} from '../src/utilities/sampleVolumeGrid';
import { getVolumeSliceGeometry } from '../src/utilities/volumeSliceGeometry';
import { mapBlendModeToSlabType } from '../src/RenderingEngine/GenericViewport/Planar/planarVolumeSliceBlendMode';
import VoxelManager from '../src/utilities/VoxelManager';

const dimensions = [6, 5, 20];
const spacing = [1, 1, 1];

/**
 * The value of a voxel of the test volume.
 */
function voxelValue(i, j, k) {
  return ((i * 37 + j * 101 + k * 53) % 211) - 70;
}

/**
 * Builds an image volume of the given array type with one typed array for
 * all its voxels.
 */
function makeVolume(ArrayType = Int16Array) {
  const [columns, rows, slices] = dimensions;
  const scalarData = new ArrayType(columns * rows * slices);

  for (let k = 0; k < slices; k++) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        scalarData[(k * rows + j) * columns + i] =
          voxelValue(i, j, k) + (ArrayType === Float32Array ? 0.25 : 0);
      }
    }
  }

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setOrigin([3, -4, 5]);
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  return {
    dimensions,
    spacing,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageData,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData,
    }),
    scalarData,
  };
}

/**
 * The geometry of an axial slice through the continuous slice index k.
 */
function axialGeometry(volume, k, snapToSlice = true) {
  return getVolumeSliceGeometry(
    volume,
    {
      focalPoint: volume.imageData.indexToWorld([2.2, 1.9, k]),
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, -1, 0],
    },
    { snapToSlice }
  );
}

/**
 * The slice index and the voxel indices i and j of each pixel of an axial
 * slice geometry.
 */
function pixelVoxels(volume, geometry) {
  const voxels = [];

  for (let row = 0; row < geometry.height; row++) {
    for (let column = 0; column < geometry.width; column++) {
      const world = [0, 1, 2].map(
        (axis) =>
          geometry.origin[axis] +
          column * geometry.xDirection[axis] +
          row * geometry.yDirection[axis]
      );
      const index = volume.imageData.worldToIndex(world);

      voxels.push([Math.round(index[0]), Math.round(index[1])]);
    }
  }

  return voxels;
}

/**
 * The positions of the slab samples of the vtk.js image reslice mapper for a
 * pixel whose samples all lie in the volume, written as the shader loop of
 * vtk.js 36 (getSlabSampleLoopLines), without trapezoid integration.
 */
function vtkSlabOffsets(thickness, smallestSpacing) {
  const scaling = smallestSpacing * 0.5;
  const offsets = [0];
  let numSlices = 1;
  let step = scaling;
  let distTraveled = scaling;

  while (distTraveled < thickness * 0.5) {
    distTraveled += scaling;

    const fnumSlices = numSlices;

    if (distTraveled > thickness * 0.5) {
      step = (thickness * 0.5) / fnumSlices;
    }

    offsets.push(-fnumSlices * step);
    numSlices += 1;
    offsets.push(fnumSlices * step);
    numSlices += 1;
  }

  return offsets;
}

/**
 * A small deterministic random number generator, so that a failing case can
 * be reproduced from its seed.
 */
function createRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

/**
 * Builds a volume of random dimensions, spacing and values of the given array
 * type. A float volume gets a few NaN voxels when withNaN is true.
 */
function makeRandomVolume(random, ArrayType, withNaN) {
  const volumeDimensions = [0, 1, 2].map(() => 3 + Math.floor(random() * 8));
  const volumeSpacing = [0, 1, 2].map(
    () => [0.5, 1, 1.5][Math.floor(random() * 3)]
  );
  const scalarData = new ArrayType(
    volumeDimensions[0] * volumeDimensions[1] * volumeDimensions[2]
  );

  for (let index = 0; index < scalarData.length; index++) {
    scalarData[index] =
      ArrayType === Float32Array
        ? (random() - 0.5) * 2000
        : Math.floor(random() * 4000) - 2000;
  }

  if (withNaN) {
    for (let count = 0; count < 3; count++) {
      scalarData[Math.floor(random() * scalarData.length)] = NaN;
    }
  }

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(volumeDimensions);
  imageData.setSpacing(volumeSpacing);
  imageData.setOrigin([3, -4, 5]);
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  return {
    dimensions: volumeDimensions,
    spacing: volumeSpacing,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageData,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions: volumeDimensions,
      scalarData,
    }),
  };
}

function normalize(vector) {
  const length = Math.hypot(...vector);

  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * A random slice geometry of a volume. A straight one follows two volume
 * axes, one voxel per pixel, on a voxel plane or between two; an oblique one
 * has a random normal and pixel size. Both are often larger than the volume
 * or placed so that the plane or the slab leaves the volume.
 */
function makeRandomGeometry(random, volume, straight) {
  const { dimensions: volumeDimensions, spacing: volumeSpacing } = volume;

  if (straight) {
    const normalAxis = Math.floor(random() * 3);
    const [columnAxis, rowAxis] = [0, 1, 2]
      .filter((axis) => axis !== normalAxis)
      .sort(() => random() - 0.5);
    const unit = (axis, sign) => {
      const vector = [0, 0, 0];

      vector[axis] = sign;

      return vector;
    };
    const columnSign = random() < 0.5 ? -1 : 1;
    const rowSign = random() < 0.5 ? -1 : 1;
    const startIndex = [0, 0, 0];
    const width = volumeDimensions[columnAxis] + Math.floor(random() * 4) - 1;
    const height = volumeDimensions[rowAxis] + Math.floor(random() * 4) - 1;

    startIndex[columnAxis] =
      (columnSign > 0 ? 0 : volumeDimensions[columnAxis] - 1) -
      columnSign * Math.floor(random() * 3);
    startIndex[rowAxis] =
      (rowSign > 0 ? 0 : volumeDimensions[rowAxis] - 1) -
      rowSign * Math.floor(random() * 3);
    startIndex[normalAxis] =
      random() < 0.5
        ? Math.floor(random() * volumeDimensions[normalAxis])
        : random() * (volumeDimensions[normalAxis] + 1) - 1;

    return {
      origin: volume.imageData.indexToWorld(startIndex),
      xDirection: unit(columnAxis, columnSign),
      yDirection: unit(rowAxis, rowSign),
      zDirection: cross(unit(columnAxis, columnSign), unit(rowAxis, rowSign)),
      spacing: [volumeSpacing[columnAxis], volumeSpacing[rowAxis]],
      width: Math.max(1, width),
      height: Math.max(1, height),
      sliceIndex: 0,
    };
  }

  const zDirection = normalize([
    random() - 0.5,
    random() - 0.5,
    random() - 0.5,
  ]);
  const xDirection = normalize(
    cross(zDirection, normalize([random() - 0.5, random() - 0.5, 1]))
  );
  const yDirection = cross(zDirection, xDirection);
  const pixelSpacing = 0.4 + random();
  const width = 4 + Math.floor(random() * 14);
  const height = 4 + Math.floor(random() * 14);
  const center = volume.imageData.indexToWorld(
    volumeDimensions.map((size) => random() * (size + 2) - 1)
  );

  return {
    origin: [0, 1, 2].map(
      (axis) =>
        center[axis] -
        (xDirection[axis] * width + yDirection[axis] * height) *
          pixelSpacing *
          0.5
    ),
    xDirection,
    yDirection,
    zDirection,
    spacing: [pixelSpacing, pixelSpacing],
    width,
    height,
    sliceIndex: 0,
  };
}

/**
 * The slice grid of a geometry as sampleVolumeSlice makes it: the voxel index
 * of the first pixel, the index steps along a row, a column and one
 * millimetre of the normal, with the same snapping.
 */
function referenceGrid(volume, geometry) {
  const wholeIndexEpsilon = 1e-9;
  const sliceIndexTolerance = 1e-4;
  const snapToWholeIndex = (index) =>
    index.map((value) => {
      const whole = Math.round(value);

      return Math.abs(value - whole) < wholeIndexEpsilon ? whole : value;
    });
  const getStepAxis = (step) => {
    const axes = [0, 1, 2].filter((axis) => step[axis] !== 0);

    return axes.length === 1 ? axes[0] : -1;
  };
  const { imageData } = volume;
  const { origin, xDirection, yDirection, zDirection } = geometry;
  const startIndex = snapToWholeIndex(imageData.worldToIndex(origin));
  const indexStep = (direction, distance) => {
    const after = imageData.worldToIndex(
      [0, 1, 2].map((axis) => origin[axis] + direction[axis] * distance)
    );

    return [0, 1, 2].map((axis) => after[axis] - startIndex[axis]);
  };
  const columnStep = snapToWholeIndex(
    indexStep(xDirection, geometry.spacing[0])
  );
  const rowStep = snapToWholeIndex(indexStep(yDirection, geometry.spacing[1]));
  const normalStep = indexStep(zDirection, 1);
  const columnAxis = getStepAxis(columnStep);
  const rowAxis = getStepAxis(rowStep);

  if (columnAxis >= 0 && rowAxis >= 0 && columnAxis !== rowAxis) {
    const fixedAxis = 3 - columnAxis - rowAxis;
    const whole = Math.round(startIndex[fixedAxis]);

    if (Math.abs(startIndex[fixedAxis] - whole) <= sliceIndexTolerance) {
      startIndex[fixedAxis] = whole;
    }
  }

  return { startIndex, columnStep, rowStep, normalStep, snapToWholeIndex };
}

/**
 * A copy of the slab sampling of sampleVolumeSlice before it was made
 * faster: the slice grid of the geometry, one sampleVolumeGrid call per slab
 * layer into an array of doubles, and one combine loop with a count per
 * pixel, with the fixed offsets of getSlabSampleOffsets for every cut. The
 * faster code must give the same values for an oblique cut, and for a
 * straight cut whose slab stays inside the volume.
 */
function sampleSlabReference(volume, geometry, options) {
  const { interpolationType, outsideValue, slab } = options;
  const { startIndex, columnStep, rowStep, normalStep, snapToWholeIndex } =
    referenceGrid(volume, geometry);
  const { width, height } = geometry;
  const pixelCount = width * height;
  const ArrayType = volume.voxelManager.getConstructor();
  const pixelData = new ArrayType(pixelCount);
  const round = ArrayType !== Float32Array && ArrayType !== Float64Array;
  const slabType = mapBlendModeToSlabType(slab.blendMode);
  const offsets = getSlabSampleOffsets(volume, slab.thickness);
  const combined = new Float64Array(pixelCount);
  const counts = new Uint32Array(pixelCount);
  const planeValues = new Float64Array(pixelCount);
  const isMean = slabType === SlabTypes.MEAN || slabType === SlabTypes.SUM;
  const isMax = slabType === SlabTypes.MAX;
  const insideVolume = new Uint8Array(pixelCount);

  offsets.forEach((offset, offsetIndex) => {
    const layerStart = snapToWholeIndex(
      [0, 1, 2].map((axis) => startIndex[axis] + offset * normalStep[axis])
    );

    sampleVolumeGrid({
      volume,
      pixelData: planeValues,
      width,
      height,
      startIndex: layerStart,
      columnStep,
      rowStep,
      interpolationType,
      outsideValue: NaN,
    });

    for (let index = 0; index < pixelCount; index++) {
      const value = planeValues[index];

      if (offsetIndex === 0) {
        const column = index % width;
        const row = (index - column) / width;
        const [i, j, k] = [0, 1, 2].map(
          (axis) =>
            layerStart[axis] + column * columnStep[axis] + row * rowStep[axis]
        );

        insideVolume[index] =
          value === value || isIndexInsideVolume(volume.dimensions, i, j, k)
            ? 1
            : 0;
      }

      if (value !== value || insideVolume[index] === 0) {
        continue;
      }

      if (counts[index] === 0) {
        combined[index] = value;
      } else if (isMean) {
        combined[index] += value;
      } else if (isMax) {
        if (value > combined[index]) {
          combined[index] = value;
        }
      } else if (value < combined[index]) {
        combined[index] = value;
      }

      counts[index]++;
    }
  });

  for (let index = 0; index < pixelCount; index++) {
    const count = counts[index];
    let value = insideVolume[index] === 1 ? NaN : outsideValue;

    if (count > 0) {
      value =
        slabType === SlabTypes.MEAN ? combined[index] / count : combined[index];

      if (round) {
        value = Math.round(value);
      }
    }

    pixelData[index] = value;
  }

  let min = Infinity;
  let max = -Infinity;

  pixelData.forEach((value) => {
    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  });

  return { pixelData: Array.from(pixelData), min, max };
}

/**
 * The slab of the vtk.js image reslice mapper, run pixel by pixel as its
 * shader loop does (vtk.js 36, getSlabSampleLoopLines, without trapezoid
 * integration): a counter of samples that starts at 1, a distance that grows
 * by half the smallest voxel spacing per turn, a pair of positions per turn
 * at the counter of the start of the turn times that step, negative side
 * first, and the last pair at half the thickness. Only a position inside the
 * volume (voxel index from -0.5 to the size minus 0.5 on every axis, the
 * texture coordinates 0 to 1) is sampled and counted. The loop stops when a
 * position outside has been seen on both sides before the last pair.
 *
 * Each sample is read with sampleVolumeGrid at the point of the pixel in the
 * layer, so only the loop is under test. A NaN voxel is left out of the
 * combination, as sampleVolumeSlice does, but counts as a sample inside for
 * the positions. An integer volume is rounded.
 */
function sampleSlabShaderReference(volume, geometry, options) {
  const { interpolationType, outsideValue, slab } = options;
  const { startIndex, columnStep, rowStep, normalStep, snapToWholeIndex } =
    referenceGrid(volume, geometry);
  const { width, height } = geometry;
  const ArrayType = volume.voxelManager.getConstructor();
  const round = ArrayType !== Float32Array && ArrayType !== Float64Array;
  const slabType = mapBlendModeToSlabType(slab.blendMode);
  const pixelData = new ArrayType(width * height);
  const scaling = Math.min(...volume.spacing) * 0.5;
  const halfThickness = slab.thickness * 0.5;
  const isInside = (index) =>
    index.every(
      (value, axis) =>
        value >= -0.5 - 1e-9 && value <= volume.dimensions[axis] - 0.5 + 1e-9
    );
  const sampleAt = (offset, column, row) => {
    const layerStart = snapToWholeIndex(
      [0, 1, 2].map((axis) => startIndex[axis] + offset * normalStep[axis])
    );
    const index = [0, 1, 2].map(
      (axis) =>
        layerStart[axis] + column * columnStep[axis] + row * rowStep[axis]
    );
    const value = [NaN];

    sampleVolumeGrid({
      volume,
      pixelData: value,
      width: 1,
      height: 1,
      startIndex: index,
      columnStep,
      rowStep,
      interpolationType,
      outsideValue: NaN,
    });

    return { index, value: value[0] };
  };

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const pixel = row * width + column;
      const centre = sampleAt(0, column, row);

      if (
        centre.value !== centre.value &&
        !isIndexInsideVolume(volume.dimensions, ...centre.index)
      ) {
        pixelData[pixel] = outsideValue;
        continue;
      }

      const values = [centre.value];
      let numSlices = 1;
      let distTraveled = scaling;
      let negExited = false;
      let posExited = false;

      while (distTraveled < halfThickness) {
        distTraveled += scaling;

        const fnumSlices = numSlices;
        const atSlabBoundary = distTraveled > halfThickness;
        const distance = atSlabBoundary ? halfThickness : fnumSlices * scaling;
        const negative = sampleAt(-distance, column, row);

        if (isInside(negative.index)) {
          values.push(negative.value);
          numSlices += 1;
        } else if (!atSlabBoundary) {
          negExited = true;
        }

        const positive = sampleAt(distance, column, row);

        if (isInside(positive.index)) {
          values.push(positive.value);
          numSlices += 1;
        } else if (!atSlabBoundary) {
          posExited = true;
        }

        if (negExited && posExited) {
          break;
        }
      }

      const samples = values.filter((value) => value === value);
      let value = NaN;

      if (samples.length) {
        if (slabType === SlabTypes.MAX) {
          value = samples.reduce((a, b) => (b > a ? b : a));
        } else if (slabType === SlabTypes.MIN) {
          value = samples.reduce((a, b) => (b < a ? b : a));
        } else {
          let sum = 0;

          samples.forEach((sample) => {
            sum += sample;
          });
          value = slabType === SlabTypes.MEAN ? sum / samples.length : sum;
        }

        if (round) {
          value = Math.round(value);
        }
      }

      pixelData[pixel] = value;
    }
  }

  let min = Infinity;
  let max = -Infinity;

  pixelData.forEach((value) => {
    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  });

  return { pixelData: Array.from(pixelData), min, max };
}

/**
 * Whether every fixed slab offset of a straight cut lies inside the volume
 * along the normal, so that the slab of each pixel inside stays inside.
 */
function isStraightSlabInside(volume, geometry, thickness) {
  const { startIndex, normalStep } = referenceGrid(volume, geometry);

  return getSlabSampleOffsets(volume, thickness).every((offset) =>
    [0, 1, 2].every((axis) => {
      const value = startIndex[axis] + offset * normalStep[axis];

      return (
        Math.abs(normalStep[axis]) < 1e-6 ||
        (value >= -0.5 && value <= volume.dimensions[axis] - 0.5)
      );
    })
  );
}

/**
 * The geometry of a straight cut with the normal along one volume axis, at a
 * continuous index on that axis, one pixel per voxel.
 */
function straightGeometry(volume, normalAxis, position) {
  const [columnAxis, rowAxis] = [0, 1, 2].filter((axis) => axis !== normalAxis);
  const unit = (axis) => [0, 1, 2].map((each) => (each === axis ? 1 : 0));
  const startIndex = [0, 0, 0];

  startIndex[normalAxis] = position;

  return {
    origin: volume.imageData.indexToWorld(startIndex),
    xDirection: unit(columnAxis),
    yDirection: unit(rowAxis),
    zDirection: cross(unit(columnAxis), unit(rowAxis)),
    spacing: [volume.spacing[columnAxis], volume.spacing[rowAxis]],
    width: volume.dimensions[columnAxis],
    height: volume.dimensions[rowAxis],
    sliceIndex: 0,
  };
}

/**
 * Builds a volume of the given dimensions, spacing and array type whose
 * voxels come from a function of their index.
 */
function makeVolumeOf(volumeDimensions, volumeSpacing, ArrayType, valueOf) {
  const scalarData = new ArrayType(
    volumeDimensions[0] * volumeDimensions[1] * volumeDimensions[2]
  );

  for (let k = 0; k < volumeDimensions[2]; k++) {
    for (let j = 0; j < volumeDimensions[1]; j++) {
      for (let i = 0; i < volumeDimensions[0]; i++) {
        scalarData[(k * volumeDimensions[1] + j) * volumeDimensions[0] + i] =
          valueOf(i, j, k);
      }
    }
  }

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(volumeDimensions);
  imageData.setSpacing(volumeSpacing);
  imageData.setOrigin([3, -4, 5]);
  imageData.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  return {
    dimensions: volumeDimensions,
    spacing: volumeSpacing,
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageData,
    voxelManager: VoxelManager.createScalarVolumeVoxelManager({
      dimensions: volumeDimensions,
      scalarData,
    }),
  };
}

const slabBlendModes = [
  BlendModes.MAXIMUM_INTENSITY_BLEND,
  BlendModes.MINIMUM_INTENSITY_BLEND,
  BlendModes.AVERAGE_INTENSITY_BLEND,
];

describe('sampleVolumeSlice', () => {
  describe.each([
    ['an integer', Int16Array, false],
    ['a float', Float32Array, false],
    ['a float with NaN voxels', Float32Array, true],
  ])('on %s volume', (_name, ArrayType, withNaN) => {
    it.each([
      ['straight', true],
      ['oblique', false],
    ])(
      'gives the slab values of the reference for a %s slice of every slab type',
      (_cut, straight) => {
        const random = createRandom(straight ? 41 : 43);

        for (let caseNumber = 0; caseNumber < 120; caseNumber++) {
          const volume = makeRandomVolume(random, ArrayType, withNaN);
          const geometry = makeRandomGeometry(random, volume, straight);
          const thickness = 1.6 + random() * 9;
          const interpolationType =
            random() < 0.5
              ? InterpolationType.NEAREST
              : InterpolationType.LINEAR;

          expect(
            getSlabSampleOffsets(volume, thickness).length
          ).toBeGreaterThan(1);

          [
            BlendModes.MAXIMUM_INTENSITY_BLEND,
            BlendModes.MINIMUM_INTENSITY_BLEND,
            BlendModes.AVERAGE_INTENSITY_BLEND,
          ].forEach((blendMode) => {
            const options = {
              interpolationType,
              outsideValue: -5000,
              slab: { thickness, blendMode },
            };
            const sampled = sampleVolumeSlice({ volume, geometry, ...options });
            const actual = {
              caseNumber,
              blendMode,
              pixelData: Array.from(sampled.pixelData),
              min: sampled.min,
              max: sampled.max,
            };

            if (
              !straight ||
              isStraightSlabInside(volume, geometry, thickness)
            ) {
              expect(actual).toEqual({
                caseNumber,
                blendMode,
                ...sampleSlabReference(volume, geometry, options),
              });
            }

            if (straight) {
              expect(actual).toEqual({
                caseNumber,
                blendMode,
                ...sampleSlabShaderReference(volume, geometry, options),
              });
            }
          });
        }
      }
    );
  });

  it('copies a slice of voxels into an array of the volume type', () => {
    const volume = makeVolume();
    const geometry = axialGeometry(volume, 7.2);
    const { pixelData, min, max } = sampleVolumeSlice({ volume, geometry });
    const expected = pixelVoxels(volume, geometry).map(([i, j]) =>
      voxelValue(i, j, 7)
    );

    expect(pixelData).toBeInstanceOf(Int16Array);
    expect(Array.from(pixelData)).toEqual(expected);
    expect(min).toBe(Math.min(...expected));
    expect(max).toBe(Math.max(...expected));
  });

  it('reuses the array that it is given when type and length fit', () => {
    const volume = makeVolume();
    const geometry = axialGeometry(volume, 7);
    const fitting = new Int16Array(geometry.width * geometry.height);
    const otherType = new Float32Array(geometry.width * geometry.height);

    expect(
      sampleVolumeSlice({ volume, geometry, pixelData: fitting }).pixelData
    ).toBe(fitting);
    expect(
      sampleVolumeSlice({ volume, geometry, pixelData: otherType }).pixelData
    ).not.toBe(otherType);
    expect(
      sampleVolumeSlice({
        volume,
        geometry,
        pixelData: new Int16Array(3),
      }).pixelData.length
    ).toBe(geometry.width * geometry.height);
  });

  it.each([
    ['rounds', Int16Array, (value) => Math.round(value)],
    ['does not round', Float32Array, (value) => Math.fround(value)],
  ])(
    '%s a linear sample between two slices of a %p volume',
    (_name, ArrayType, finish) => {
      const volume = makeVolume(ArrayType);
      const geometry = axialGeometry(volume, 7.3, false);
      const offset = ArrayType === Float32Array ? 0.25 : 0;
      const { pixelData } = sampleVolumeSlice({
        volume,
        geometry,
        interpolationType: InterpolationType.LINEAR,
      });
      const expected = pixelVoxels(volume, geometry).map(([i, j]) =>
        finish(
          (voxelValue(i, j, 7) + offset) * 0.7 +
            (voxelValue(i, j, 8) + offset) * 0.3
        )
      );

      Array.from(pixelData).forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index], 4);
      });

      if (ArrayType === Int16Array) {
        expect(Array.from(pixelData)).toEqual(expected);
      }
    }
  );

  it('copies the slice of voxels for a straight linear cut that lies a few millionths of a voxel off its centre', () => {
    const volume = makeVolume(Float32Array);
    const geometry = axialGeometry(volume, 7.000006, false);
    const { pixelData } = sampleVolumeSlice({
      volume,
      geometry,
      interpolationType: InterpolationType.LINEAR,
    });
    const expected = pixelVoxels(volume, geometry).map(([i, j]) =>
      Math.fround(voxelValue(i, j, 7) + 0.25)
    );

    expect(Array.from(pixelData)).toEqual(expected);
  });

  it('mixes two slices of voxels for a straight linear cut that lies further off the centre than the tolerance', () => {
    const volume = makeVolume(Float32Array);
    const geometry = axialGeometry(volume, 7.001, false);
    const { pixelData } = sampleVolumeSlice({
      volume,
      geometry,
      interpolationType: InterpolationType.LINEAR,
    });
    const voxels = pixelVoxels(volume, geometry);
    const copied = voxels.map(([i, j]) =>
      Math.fround(voxelValue(i, j, 7) + 0.25)
    );

    expect(Array.from(pixelData)).not.toEqual(copied);
    Array.from(pixelData).forEach((value, index) => {
      const [i, j] = voxels[index];

      expect(value).toBeCloseTo(
        (voxelValue(i, j, 7) + 0.25) * 0.999 +
          (voxelValue(i, j, 8) + 0.25) * 0.001,
        3
      );
    });
  });

  it('gives the outside value to a pixel outside the volume', () => {
    const volume = makeVolume();
    const geometry = {
      ...axialGeometry(volume, 7),
      width: dimensions[0] + 2,
    };
    const { pixelData, min } = sampleVolumeSlice({
      volume,
      geometry,
      outsideValue: -3000,
    });

    expect(pixelData[dimensions[0]]).toBe(-3000);
    expect(pixelData[dimensions[0] + 1]).toBe(-3000);
    expect(min).toBe(-3000);
  });

  it.each([
    [6, 11],
    [5.4, 11],
    [4.6, 9],
  ])(
    'takes the slab samples of a %p mm slab where the vtk.js reslice mapper takes them',
    (thickness, sampleCount) => {
      const volume = makeVolume();
      const k = 10;
      const geometry = axialGeometry(volume, k);
      const offsets = vtkSlabOffsets(thickness, 1);
      const voxels = pixelVoxels(volume, geometry);
      const samplesOf = ([i, j]) =>
        offsets.map((offset) =>
          voxelValue(i, j, Math.floor(k + offset + 0.5 - 1e-6))
        );
      const sample = (blendMode) =>
        Array.from(
          sampleVolumeSlice({
            volume,
            geometry,
            slab: { thickness, blendMode },
          }).pixelData
        );

      expect(offsets.length).toBe(sampleCount);
      expect(sample(BlendModes.MAXIMUM_INTENSITY_BLEND)).toEqual(
        voxels.map((voxel) => Math.max(...samplesOf(voxel)))
      );
      expect(sample(BlendModes.MINIMUM_INTENSITY_BLEND)).toEqual(
        voxels.map((voxel) => Math.min(...samplesOf(voxel)))
      );
      expect(sample(BlendModes.AVERAGE_INTENSITY_BLEND)).toEqual(
        voxels.map((voxel) => {
          const samples = samplesOf(voxel);

          return Math.round(
            samples.reduce((sum, value) => sum + value, 0) / samples.length
          );
        })
      );
    }
  );

  it('moves the slab samples of a straight cut near a face closer together, as the reslice shader does', () => {
    const volume = makeVolume(Float32Array);
    const k = 1;
    const geometry = axialGeometry(volume, k);
    const { pixelData } = sampleVolumeSlice({
      volume,
      geometry,
      slab: { thickness: 6, blendMode: BlendModes.AVERAGE_INTENSITY_BLEND },
    });
    const sampleIndices = [1, 0.5, 1.5, -0.5, 2.5, 3.5, 4, 4.5];
    const expected = pixelVoxels(volume, geometry).map(([i, j]) => {
      const samples = sampleIndices.map(
        (index) =>
          voxelValue(i, j, Math.max(0, Math.floor(index + 0.5 - 1e-6))) + 0.25
      );

      return samples.reduce((sum, value) => sum + value, 0) / samples.length;
    });

    Array.from(pixelData).forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index], 4);
    });
  });

  it('gives the slab of the review example: a maximum at the first slice reaches the bright slice', () => {
    const along = [0, 0, 100, 0, 0, 0];
    const volume = makeVolumeOf(
      [2, 2, 6],
      [1, 1, 1],
      Int16Array,
      (i, j, k) => along[k]
    );
    const geometry = straightGeometry(volume, 2, 0);
    const sample = (blendMode, keepFractions) =>
      Array.from(
        sampleVolumeSlice({
          volume,
          geometry,
          interpolationType: InterpolationType.LINEAR,
          slab: { thickness: 6, blendMode },
          keepFractions,
        }).pixelData
      );

    expect(
      getSlabSampleOffsets(volume, 6)
        .filter((offset) => offset >= -0.5)
        .map((offset) =>
          offset <= 0 ? 0 : 100 * Math.max(0, 1 - Math.abs(offset - 2))
        )
        .reduce((a, b) => Math.max(a, b))
    ).toBe(50);
    expect(sample(BlendModes.MAXIMUM_INTENSITY_BLEND)).toEqual([
      100, 100, 100, 100,
    ]);
    expect(sample(BlendModes.AVERAGE_INTENSITY_BLEND)).toEqual([
      29, 29, 29, 29,
    ]);
    expect(sample(BlendModes.AVERAGE_INTENSITY_BLEND, true)).toEqual(
      new Array(4).fill(Math.fround(200 / 7))
    );
  });

  describe.each([
    ['an integer', Int16Array],
    ['a float', Float32Array],
  ])('on %s volume', (_name, ArrayType) => {
    it.each([
      ['equal', [1, 1, 1]],
      ['unequal', [0.8, 1, 1.25]],
    ])(
      'gives the slab of the reslice shader for straight cuts at every slice position, spacing %s',
      (_spacingName, volumeSpacing) => {
        const volume = makeVolumeOf(
          [4, 3, 6],
          volumeSpacing,
          ArrayType,
          (i, j, k) =>
            voxelValue(i, j, k) * 7 + (ArrayType === Float32Array ? 0.375 : 0)
        );

        [0, 1, 2].forEach((normalAxis) => {
          const size = volume.dimensions[normalAxis];
          const positions = [];

          for (let index = 0; index < size; index++) {
            positions.push(index, index + 0.5);
          }

          positions.push(-0.5, size - 0.5);

          positions.forEach((position) => {
            [2.2, 3.5, 6, 9, 25].forEach((thickness) => {
              [InterpolationType.NEAREST, InterpolationType.LINEAR].forEach(
                (interpolationType) => {
                  slabBlendModes.forEach((blendMode) => {
                    const geometry = straightGeometry(
                      volume,
                      normalAxis,
                      position
                    );
                    const options = {
                      interpolationType,
                      outsideValue: -5000,
                      slab: { thickness, blendMode },
                    };
                    const sampled = sampleVolumeSlice({
                      volume,
                      geometry,
                      ...options,
                    });

                    expect({
                      normalAxis,
                      position,
                      thickness,
                      interpolationType,
                      blendMode,
                      pixelData: Array.from(sampled.pixelData),
                      min: sampled.min,
                      max: sampled.max,
                    }).toEqual({
                      normalAxis,
                      position,
                      thickness,
                      interpolationType,
                      blendMode,
                      ...sampleSlabShaderReference(volume, geometry, options),
                    });
                  });
                }
              );
            });
          });
        });
      }
    );
  });

  it('leaves a NaN voxel out of the slab and keeps the outside value for a pixel outside the volume', () => {
    const volume = makeVolume(Float32Array);
    const k = 10;
    const thickness = 4.6;
    const nanVoxel = [2, 1, k];
    const [columns, rows] = dimensions;
    const geometry = {
      ...axialGeometry(volume, k),
      width: columns + 1,
    };
    const offsets = vtkSlabOffsets(thickness, 1);
    const valueAt = (i, j, voxelK) =>
      i === nanVoxel[0] && j === nanVoxel[1] && voxelK === nanVoxel[2]
        ? NaN
        : voxelValue(i, j, voxelK) + 0.25;

    volume.scalarData[
      (nanVoxel[2] * rows + nanVoxel[1]) * columns + nanVoxel[0]
    ] = NaN;

    const insideGeometry = axialGeometry(volume, k);
    const voxels = pixelVoxels(volume, insideGeometry);
    const nanPixel = voxels.findIndex(
      ([i, j]) => i === nanVoxel[0] && j === nanVoxel[1]
    );
    const samplesOf = ([i, j]) =>
      offsets
        .map((offset) => valueAt(i, j, Math.floor(k + offset + 0.5 - 1e-6)))
        .filter((value) => !Number.isNaN(value));
    const sample = (blendMode) =>
      sampleVolumeSlice({
        volume,
        geometry,
        outsideValue: -3000,
        slab: { thickness, blendMode },
      }).pixelData;
    const pixelOf = (pixelData, index) =>
      pixelData[
        Math.floor(index / insideGeometry.width) * geometry.width +
          (index % insideGeometry.width)
      ];

    expect(nanPixel).toBeGreaterThanOrEqual(0);
    expect(samplesOf(voxels[nanPixel]).length).toBeLessThan(offsets.length);

    const maximum = sample(BlendModes.MAXIMUM_INTENSITY_BLEND);
    const minimum = sample(BlendModes.MINIMUM_INTENSITY_BLEND);
    const average = sample(BlendModes.AVERAGE_INTENSITY_BLEND);

    voxels.forEach((voxel, index) => {
      const samples = samplesOf(voxel);

      expect(pixelOf(maximum, index)).toBeCloseTo(Math.max(...samples), 4);
      expect(pixelOf(minimum, index)).toBeCloseTo(Math.min(...samples), 4);
      expect(pixelOf(average, index)).toBeCloseTo(
        samples.reduce((sum, value) => sum + value, 0) / samples.length,
        4
      );
    });

    for (let row = 0; row < geometry.height; row++) {
      expect(maximum[row * geometry.width + columns]).toBe(-3000);
      expect(average[row * geometry.width + columns]).toBe(-3000);
    }
  });

  it('gives the plain slice for a slab no thicker than the smallest voxel spacing', () => {
    const volume = makeVolume();
    const geometry = axialGeometry(volume, 9);
    const plain = sampleVolumeSlice({ volume, geometry });

    [0, 0.5, 1].forEach((thickness) => {
      expect(
        Array.from(
          sampleVolumeSlice({
            volume,
            geometry,
            slab: {
              thickness,
              blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
            },
          }).pixelData
        )
      ).toEqual(Array.from(plain.pixelData));
    });
  });

  it('samples an oblique slice as sampleVolumeGrid does', () => {
    const volume = makeVolume();
    const geometry = getVolumeSliceGeometry(volume, {
      focalPoint: volume.imageData.indexToWorld([2.3, 2.1, 9.7]),
      viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
      viewUp: [0, 1, 0],
    });
    const { pixelData } = sampleVolumeSlice({ volume, geometry });

    for (let row = 0; row < geometry.height; row++) {
      for (let column = 0; column < geometry.width; column++) {
        const world = [0, 1, 2].map(
          (axis) =>
            geometry.origin[axis] +
            column * geometry.spacing[0] * geometry.xDirection[axis] +
            row * geometry.spacing[1] * geometry.yDirection[axis]
        );
        const index = volume.imageData
          .worldToIndex(world)
          .map((value) => Math.floor(value + 0.5 - 1e-6));
        const inside = index.every(
          (value, axis) => value >= 0 && value < dimensions[axis]
        );

        expect(pixelData[row * geometry.width + column]).toBe(
          inside ? voxelValue(index[0], index[1], index[2]) : 0
        );
      }
    }
  });

  it.each([
    [3, 'plain slice', undefined],
    [4, 'plain slice', undefined],
    [3, 'maximum slab', BlendModes.MAXIMUM_INTENSITY_BLEND],
    [4, 'average slab', BlendModes.AVERAGE_INTENSITY_BLEND],
  ])(
    'samples each of %p components as a volume of its own for a %s',
    (numberOfComponents, _name, blendMode) => {
      const random = createRandom(numberOfComponents * 7 + (blendMode ?? 0));

      for (let caseNumber = 0; caseNumber < 40; caseNumber++) {
        const scalar = makeRandomVolume(random, Uint8Array, false);
        const voxelCount =
          scalar.dimensions[0] * scalar.dimensions[1] * scalar.dimensions[2];
        const colourArray = new Uint8Array(voxelCount * numberOfComponents);

        for (let index = 0; index < colourArray.length; index++) {
          colourArray[index] = Math.floor(random() * 256);
        }

        const volumeOf = (scalarData, components) => ({
          ...scalar,
          voxelManager: VoxelManager.createScalarVolumeVoxelManager({
            dimensions: scalar.dimensions,
            scalarData,
            numberOfComponents: components,
          }),
        });
        const colour = volumeOf(colourArray, numberOfComponents);
        const geometry = makeRandomGeometry(random, scalar, random() < 0.5);
        const options = {
          geometry,
          interpolationType:
            random() < 0.5
              ? InterpolationType.NEAREST
              : InterpolationType.LINEAR,
          outsideValue: 0,
          slab:
            blendMode === undefined ? undefined : { thickness: 4, blendMode },
        };
        const sampled = sampleVolumeSlice({ volume: colour, ...options });
        const components = Array.from(
          { length: numberOfComponents },
          (_, component) => {
            const values = new Uint8Array(voxelCount);

            for (let index = 0; index < voxelCount; index++) {
              values[index] =
                colourArray[index * numberOfComponents + component];
            }

            return sampleVolumeSlice({
              volume: volumeOf(values, 1),
              ...options,
            });
          }
        );
        const expected = [];

        for (let pixel = 0; pixel < geometry.width * geometry.height; pixel++) {
          components.forEach(({ pixelData }) =>
            expected.push(pixelData[pixel])
          );
        }

        expect(sampled.pixelData).toBeInstanceOf(Uint8Array);
        expect({
          caseNumber,
          pixelData: Array.from(sampled.pixelData),
        }).toEqual({ caseNumber, pixelData: expected });
        expect(sampled.min).toBe(Math.min(...components.map(({ min }) => min)));
        expect(sampled.max).toBe(Math.max(...components.map(({ max }) => max)));
      }
    }
  );

  describe('keepFractions', () => {
    const sampleWith = (volume, geometry, options) => {
      const sliceOptions = {
        volume,
        geometry,
        keepFractions: true,
        ...options,
      };
      const sampled = sampleVolumeSlice(sliceOptions);

      expect(sampled.pixelData.constructor).toBe(
        getVolumeSliceArrayType(sliceOptions)
      );

      return sampled;
    };

    it('keeps a linear sample between two slices of an integer volume as a Float32Array', () => {
      const volume = makeVolume(Int16Array);
      const geometry = axialGeometry(volume, 7.5, false);
      const { pixelData, min, max } = sampleWith(volume, geometry, {
        interpolationType: InterpolationType.LINEAR,
      });
      const expected = pixelVoxels(volume, geometry).map(
        ([i, j]) => (voxelValue(i, j, 7) + voxelValue(i, j, 8)) / 2
      );

      expect(pixelData).toBeInstanceOf(Float32Array);
      expect(Array.from(pixelData)).toEqual(expected);
      expect(expected.some((value) => !Number.isInteger(value))).toBe(true);
      expect(min).toBe(Math.min(...expected));
      expect(max).toBe(Math.max(...expected));
    });

    it('gives 0.5 halfway between a voxel of 0 and a voxel of 1', () => {
      const volume = makeVolumeOf(
        [2, 2, 2],
        [1, 1, 1],
        Uint8Array,
        (i, j, k) => k
      );
      const geometry = straightGeometry(volume, 2, 0.5);
      const linear = { interpolationType: InterpolationType.LINEAR };

      expect(
        Array.from(sampleWith(volume, geometry, linear).pixelData)
      ).toEqual([0.5, 0.5, 0.5, 0.5]);
      expect(
        Array.from(sampleVolumeSlice({ volume, geometry, ...linear }).pixelData)
      ).toEqual([1, 1, 1, 1]);
    });

    it('keeps the volume type and copies a straight cut on a slice of voxels', () => {
      const volume = makeVolume(Int16Array);
      const onPlane = axialGeometry(volume, 7, false);
      const expected = pixelVoxels(volume, onPlane).map(([i, j]) =>
        voxelValue(i, j, 7)
      );

      [InterpolationType.NEAREST, InterpolationType.LINEAR].forEach(
        (interpolationType) => {
          const { pixelData } = sampleWith(volume, onPlane, {
            interpolationType,
          });

          expect(pixelData).toBeInstanceOf(Int16Array);
          expect(Array.from(pixelData)).toEqual(expected);
        }
      );

      expect(
        sampleWith(volume, axialGeometry(volume, 7.4), {}).pixelData
      ).toBeInstanceOf(Int16Array);
    });

    it('chooses the array type of a slab by whether it mixes voxels', () => {
      const volume = makeVolume(Int16Array);
      const geometry = axialGeometry(volume, 10);
      const typeOf = (interpolationType, blendMode) =>
        sampleWith(volume, geometry, {
          interpolationType,
          slab: { thickness: 4.6, blendMode },
        }).pixelData.constructor;

      expect(
        typeOf(InterpolationType.NEAREST, BlendModes.MAXIMUM_INTENSITY_BLEND)
      ).toBe(Int16Array);
      expect(
        typeOf(InterpolationType.NEAREST, BlendModes.MINIMUM_INTENSITY_BLEND)
      ).toBe(Int16Array);
      expect(
        typeOf(InterpolationType.NEAREST, BlendModes.AVERAGE_INTENSITY_BLEND)
      ).toBe(Float32Array);
      expect(
        typeOf(InterpolationType.LINEAR, BlendModes.MAXIMUM_INTENSITY_BLEND)
      ).toBe(Float32Array);
    });

    it('keeps the fraction of an average slab and of an oblique sample', () => {
      const volume = makeVolume(Int16Array);
      const geometry = axialGeometry(volume, 10);
      const offsets = vtkSlabOffsets(4.6, 1);
      const { pixelData } = sampleWith(volume, geometry, {
        slab: { thickness: 4.6, blendMode: BlendModes.AVERAGE_INTENSITY_BLEND },
      });
      const expected = pixelVoxels(volume, geometry).map(([i, j]) => {
        let sum = 0;

        offsets.forEach((offset) => {
          sum += voxelValue(i, j, Math.floor(10 + offset + 0.5 - 1e-6));
        });

        return Math.fround(sum / offsets.length);
      });

      expect(Array.from(pixelData)).toEqual(expected);

      const oblique = getVolumeSliceGeometry(volume, {
        focalPoint: volume.imageData.indexToWorld([2.3, 2.1, 9.7]),
        viewPlaneNormal: [Math.SQRT1_2, 0, Math.SQRT1_2],
        viewUp: [0, 1, 0],
      });
      const fractions = sampleWith(volume, oblique, {
        interpolationType: InterpolationType.LINEAR,
      }).pixelData;
      const rounded = sampleVolumeSlice({
        volume,
        geometry: oblique,
        interpolationType: InterpolationType.LINEAR,
      }).pixelData;

      expect(fractions).toBeInstanceOf(Float32Array);
      expect(rounded).toBeInstanceOf(Int16Array);
      Array.from(fractions).forEach((value, index) => {
        expect(Math.abs(value - rounded[index])).toBeLessThanOrEqual(
          0.5 + 1e-5
        );
      });
      expect(
        Array.from(fractions).some((value) => !Number.isInteger(value))
      ).toBe(true);
    });

    it('changes nothing for a float volume and reuses a fitting Float32Array', () => {
      const volume = makeVolume(Float32Array);
      const geometry = axialGeometry(volume, 7.3, false);
      const options = { interpolationType: InterpolationType.LINEAR };
      const plain = sampleVolumeSlice({ volume, geometry, ...options });
      const given = new Float32Array(geometry.width * geometry.height);
      const kept = sampleWith(volume, geometry, {
        ...options,
        pixelData: given,
      });

      expect(kept.pixelData).toBe(given);
      expect(Array.from(kept.pixelData)).toEqual(Array.from(plain.pixelData));

      const integerVolume = makeVolume(Int16Array);
      const integerGiven = new Float32Array(geometry.width * geometry.height);

      expect(
        sampleWith(integerVolume, geometry, {
          ...options,
          pixelData: integerGiven,
        }).pixelData
      ).toBe(integerGiven);
    });
  });

  describe('a slab far thicker than the volume', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each([
      ['straight', true],
      ['oblique', false],
    ])(
      'gives the pixels of a slab that just covers the volume, with a bounded number of layers, for a %s cut',
      (_cut, straight) => {
        const random = createRandom(straight ? 71 : 73);

        for (let caseNumber = 0; caseNumber < 30; caseNumber++) {
          const volume = makeRandomVolume(
            random,
            caseNumber % 2 ? Float32Array : Int16Array,
            false
          );
          const geometry = makeRandomGeometry(random, volume, straight);
          const diagonal = Math.hypot(
            ...volume.dimensions.map(
              (size, axis) => (size + 2) * volume.spacing[axis]
            )
          );
          const interpolationType =
            random() < 0.5
              ? InterpolationType.NEAREST
              : InterpolationType.LINEAR;

          slabBlendModes.forEach((blendMode) => {
            const spy = jest.spyOn(sampleVolumeGridModule, 'default');
            const sample = (thickness) => {
              spy.mockClear();

              const sampled = sampleVolumeSlice({
                volume,
                geometry,
                interpolationType,
                outsideValue: -5000,
                slab: { thickness, blendMode },
              });

              return {
                pixelData: Array.from(sampled.pixelData),
                min: sampled.min,
                max: sampled.max,
                calls: spy.mock.calls.length,
              };
            };
            const covering = sample(4 * diagonal);
            const huge = sample(50000);

            expect({ caseNumber, blendMode, ...huge }).toEqual({
              caseNumber,
              blendMode,
              ...covering,
            });
            expect(huge.calls).toBeLessThanOrEqual(
              2 * Math.ceil(diagonal / (Math.min(...volume.spacing) / 2)) + 3
            );
            spy.mockRestore();
          });
        }
      }
    );
  });
});
