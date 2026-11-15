import { describe, it, expect } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { BlendModes, InterpolationType } from '../src/enums';
import sampleVolumeSlice from '../src/utilities/sampleVolumeSlice';
import { getVolumeSliceGeometry } from '../src/utilities/volumeSliceGeometry';
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

describe('sampleVolumeSlice', () => {
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

  it('leaves out the slab samples outside the volume', () => {
    const volume = makeVolume(Float32Array);
    const k = 1;
    const geometry = axialGeometry(volume, k);
    const offsets = vtkSlabOffsets(6, 1);
    const { pixelData } = sampleVolumeSlice({
      volume,
      geometry,
      slab: { thickness: 6, blendMode: BlendModes.AVERAGE_INTENSITY_BLEND },
    });
    const expected = pixelVoxels(volume, geometry).map(([i, j]) => {
      const samples = offsets
        .filter((offset) => k + offset >= -0.5)
        .map(
          (offset) =>
            voxelValue(i, j, Math.max(0, Math.floor(k + offset + 0.5 - 1e-6))) +
            0.25
        );

      return samples.reduce((sum, value) => sum + value, 0) / samples.length;
    });

    Array.from(pixelData).forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index], 4);
    });
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
});
