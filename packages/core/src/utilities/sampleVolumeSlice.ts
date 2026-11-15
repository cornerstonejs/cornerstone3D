import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import { vec3 } from 'gl-matrix';
import InterpolationType from '../enums/InterpolationType';
import type BlendModes from '../enums/BlendModes';
import { SOURCE_SLICE_INDEX_TOLERANCE } from '../RenderingEngine/GenericViewport/Planar/planarCPUVolumeSamplingUtils';
import { mapBlendModeToSlabType } from '../RenderingEngine/GenericViewport/Planar/planarVolumeSliceBlendMode';
import type { IImageVolume, PixelDataTypedArray, Point3 } from '../types';
import sampleVolumeGrid, { isIndexInsideVolume } from './sampleVolumeGrid';
import { transformWorldToIndexContinuous } from './transformWorldToIndex';
import type { VolumeSliceGeometry } from './volumeSliceGeometry';

type VolumeSliceSlab = {
  /** Slab thickness in mm, centred on the plane of the geometry. */
  thickness: number;
  /** MAXIMUM_INTENSITY_BLEND, MINIMUM_INTENSITY_BLEND or AVERAGE_INTENSITY_BLEND. */
  blendMode: BlendModes;
};

type SampleVolumeSliceOptions = {
  volume: IImageVolume;
  geometry: VolumeSliceGeometry;
  /** NEAREST or LINEAR. Default NEAREST. */
  interpolationType?: InterpolationType;
  /** Array to fill. A new one of the volume's array type is made when it is missing or has another length. */
  pixelData?: PixelDataTypedArray;
  /** Value of a pixel that lies outside the volume. Default 0. */
  outsideValue?: number;
  slab?: VolumeSliceSlab;
};

type SampledVolumeSlice = {
  pixelData: PixelDataTypedArray;
  min: number;
  max: number;
};

const WHOLE_INDEX_EPSILON = 1e-9;

type SliceGrid = {
  startIndex: Point3;
  columnStep: Point3;
  rowStep: Point3;
  normalStep: Point3;
};

/**
 * Returns the point reached from a start point after a step along a direction,
 * in double precision.
 */
function stepAlong(start: Point3, direction: Point3, distance: number): Point3 {
  return vec3.scaleAndAdd(
    [0, 0, 0] as unknown as vec3,
    start as unknown as vec3,
    direction as unknown as vec3,
    distance
  ) as Point3;
}

/**
 * Moves each coordinate of a voxel index that lies within WHOLE_INDEX_EPSILON
 * of a whole number onto that number. A slice along a volume axis then gives
 * sampleVolumeGrid whole steps and a whole start index, which it reads as a
 * straight cut, in place of steps that miss a whole number by the rounding of
 * the world to index transform. The move is far below anything that changes
 * a nearest sample, and changes a linear sample by less than 1e-9 of the
 * difference of two voxels.
 */
function snapToWholeIndex(index: Point3): Point3 {
  return index.map((value) => {
    const whole = Math.round(value);

    return Math.abs(value - whole) < WHOLE_INDEX_EPSILON ? whole : value;
  }) as Point3;
}

/**
 * Returns the index axis that a step follows when the step moves along one
 * axis only, or -1 for any other step.
 */
function getStepAxis(step: Point3): number {
  const axes = [0, 1, 2].filter((axis) => step[axis] !== 0);

  return axes.length === 1 ? axes[0] : -1;
}

/**
 * Puts the first pixel of a straight cut on the centre of its slice of voxels
 * when it lies within SOURCE_SLICE_INDEX_TOLERANCE of that centre. A cut is
 * straight when a row and a column each follow one axis of the volume.
 *
 * The focal point of a camera carries single precision rounding, so a view
 * that scrolls from slice to slice lies a few millionths of a voxel off the
 * centre of each slice. sampleVolumeGrid would then mix two slices of voxels
 * with a weight near zero, at several times the cost of a copy. The CPU
 * volume path decides with the same tolerance that a plane lies on a slice.
 * The move changes a linear sample by at most the tolerance times the
 * difference of two neighbouring voxels.
 */
function snapStraightCutToSlice(
  startIndex: Point3,
  columnStep: Point3,
  rowStep: Point3
): Point3 {
  const columnAxis = getStepAxis(columnStep);
  const rowAxis = getStepAxis(rowStep);

  if (columnAxis < 0 || rowAxis < 0 || columnAxis === rowAxis) {
    return startIndex;
  }

  const fixedAxis = 3 - columnAxis - rowAxis;
  const whole = Math.round(startIndex[fixedAxis]);

  if (Math.abs(startIndex[fixedAxis] - whole) > SOURCE_SLICE_INDEX_TOLERANCE) {
    return startIndex;
  }

  const snapped = [...startIndex] as Point3;

  snapped[fixedAxis] = whole;

  return snapped;
}

/**
 * Turns the world geometry of a slice into the continuous voxel index of its
 * first pixel and the change of that index from one pixel to the next along a
 * row, from one row to the next and for one millimetre along the normal.
 */
function getSliceGrid(
  volume: IImageVolume,
  geometry: VolumeSliceGeometry
): SliceGrid {
  const { imageData } = volume;
  const { origin, xDirection, yDirection, zDirection, spacing } = geometry;
  const startIndex = snapToWholeIndex(
    transformWorldToIndexContinuous(imageData, origin) as Point3
  );
  const indexStep = (direction: Point3, distance: number): Point3 => {
    const after = transformWorldToIndexContinuous(
      imageData,
      stepAlong(origin, direction, distance)
    );

    return [
      after[0] - startIndex[0],
      after[1] - startIndex[1],
      after[2] - startIndex[2],
    ];
  };

  const columnStep = snapToWholeIndex(indexStep(xDirection, spacing[0]));
  const rowStep = snapToWholeIndex(indexStep(yDirection, spacing[1]));

  return {
    startIndex: snapStraightCutToSlice(startIndex, columnStep, rowStep),
    columnStep,
    rowStep,
    normalStep: indexStep(zDirection, 1),
  };
}

/**
 * Returns the distances from the slice plane, along the normal, at which the
 * vtk.js image reslice mapper samples a slab, for a pixel whose samples all
 * lie in the volume. The list starts with 0, the sample on the plane.
 *
 * The mapper steps by half the smallest voxel spacing. Its step counter grows
 * by one for each sample it takes, two per step, so the samples lie at odd
 * multiples of the step (1, 3, 5, ...) while the distance it counts grows by
 * one step only. When that distance passes half the thickness it takes a last
 * pair of samples at exactly half the thickness and stops. These are the
 * positions of vtk.js 36, reproduced here so that both paths show the same
 * picture. A slab no thicker than the smallest voxel spacing gives only the
 * sample on the plane.
 */
function getSlabSampleOffsets(
  volume: IImageVolume,
  thickness: number
): number[] {
  const offsets = [0];
  const halfThickness = thickness / 2;
  const step = Math.min(...volume.spacing) / 2;

  if (!(halfThickness > step) || !(step > 0)) {
    return offsets;
  }

  let sampleCount = 1;
  let distance = step;

  while (distance < halfThickness) {
    distance += step;

    const offset =
      distance > halfThickness ? halfThickness : sampleCount * step;

    offsets.push(-offset, offset);
    sampleCount += 2;
  }

  return offsets;
}

/**
 * Returns whether values of the array type are whole numbers.
 */
function holdsIntegers(arrayType: unknown): boolean {
  return arrayType !== Float32Array && arrayType !== Float64Array;
}

/**
 * Returns the number of components of one voxel of a volume, 1 for a
 * scalar volume and 3 or 4 for a colour volume.
 */
function getNumberOfComponents(volume: IImageVolume): number {
  return Math.max(1, volume.voxelManager?.numberOfComponents ?? 1);
}

/**
 * Returns the lowest and the highest value of an array.
 */
function getValueRange(pixelData: PixelDataTypedArray): {
  min: number;
  max: number;
} {
  let min = Infinity;
  let max = -Infinity;

  for (let index = 0; index < pixelData.length; index++) {
    const value = pixelData[index];

    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  }

  return { min, max };
}

/**
 * Returns a mask of the pixels of a slice grid whose sample on the plane lies
 * outside the volume, by the rule of sampleVolumeGrid, or undefined when no
 * pixel does. Only a pixel whose first value on the plane is NaN can lie
 * outside, since sampleVolumeGrid writes NaN there, so only those pixels are
 * tested.
 */
function getOutsidePixels(
  volume: IImageVolume,
  grid: SliceGrid,
  startIndex: Point3,
  width: number,
  height: number,
  planeValues: Float64Array,
  numberOfComponents: number
): Uint8Array | undefined {
  const { columnStep, rowStep } = grid;
  let outside: Uint8Array | undefined;

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const pixelIndex = row * width + column;
      const value = planeValues[pixelIndex * numberOfComponents];

      if (
        value === value ||
        isIndexInsideVolume(
          volume.dimensions,
          startIndex[0] + column * columnStep[0] + row * rowStep[0],
          startIndex[1] + column * columnStep[1] + row * rowStep[1],
          startIndex[2] + column * columnStep[2] + row * rowStep[2]
        )
      ) {
        continue;
      }

      outside ||= new Uint8Array(width * height);
      outside[pixelIndex] = 1;
    }
  }

  return outside;
}

/**
 * Keeps in combined, value by value, the larger of combined and layer. A NaN
 * in combined, a value without a sample yet, takes the value of the layer; a
 * NaN in the layer changes nothing.
 */
function combineMaximum(combined: Float64Array, layer: Float64Array): void {
  for (let index = 0; index < combined.length; index++) {
    const value = layer[index];
    const current = combined[index];

    if (value > current || current !== current) {
      combined[index] = value;
    }
  }
}

/**
 * Keeps in combined, value by value, the smaller of combined and layer, with
 * the NaN rules of combineMaximum.
 */
function combineMinimum(combined: Float64Array, layer: Float64Array): void {
  for (let index = 0; index < combined.length; index++) {
    const value = layer[index];
    const current = combined[index];

    if (value < current || current !== current) {
      combined[index] = value;
    }
  }
}

/**
 * Adds a layer to the sums, value by value. A NaN in the layer is not added
 * and counts as a missing sample of that value. The array of missing samples
 * is made at the first NaN, so a slab that lies inside a volume without NaN
 * voxels never makes one.
 *
 * @returns the array of missing samples, or undefined while there is none
 */
function addToSums(
  sums: Float64Array,
  layer: Float64Array,
  missing: Uint32Array | undefined
): Uint32Array | undefined {
  let counts = missing;

  for (let index = 0; index < sums.length; index++) {
    const value = layer[index];

    if (value === value) {
      sums[index] += value;
    } else {
      counts ||= new Uint32Array(sums.length);
      counts[index]++;
    }
  }

  return counts;
}

/**
 * Samples the slab around the slice plane and combines the samples of each
 * pixel with the slab type. A pixel whose sample on the plane lies outside the
 * volume gets the outside value. Any other sample outside the volume is left
 * out, as the vtk.js mapper does.
 *
 * A NaN voxel inside the volume is a sample without a value: it is left out
 * of the maximum, the minimum and the average, and a pixel whose samples are
 * all NaN is NaN, as in the plain slice. The vtk.js mapper combines the
 * samples with GLSL min, max and sum, whose result for a NaN operand the
 * GLSL specification leaves undefined, so there is no GPU picture to match.
 * sampleVolumeGrid marks a sample outside the volume with NaN too, so a NaN
 * on the plane is told apart by the position of the pixel.
 *
 * Each layer is sampled into one array of doubles and combined with a loop of
 * its own for the maximum, the minimum and the sum. The maximum and the
 * minimum keep NaN for a value that has no sample yet, so they need no count.
 * The average counts only the samples that are missing. A volume of several
 * components combines each component on its own.
 */
function sampleSlab(
  volume: IImageVolume,
  geometry: VolumeSliceGeometry,
  grid: SliceGrid,
  offsets: number[],
  slabType: SlabTypes,
  interpolationType: InterpolationType,
  pixelData: PixelDataTypedArray,
  outsideValue: number,
  round: boolean,
  numberOfComponents: number
): void {
  const { width, height } = geometry;
  const valueCount = width * height * numberOfComponents;
  const combined = new Float64Array(valueCount);
  const layer = new Float64Array(valueCount);
  const isSum = slabType === SlabTypes.MEAN || slabType === SlabTypes.SUM;
  const isMax = slabType === SlabTypes.MAX;
  const sampleLayer = (offset: number, target: Float64Array): Point3 => {
    const startIndex = snapToWholeIndex([
      grid.startIndex[0] + offset * grid.normalStep[0],
      grid.startIndex[1] + offset * grid.normalStep[1],
      grid.startIndex[2] + offset * grid.normalStep[2],
    ]);

    sampleVolumeGrid({
      volume,
      pixelData: target,
      width,
      height,
      startIndex,
      columnStep: grid.columnStep,
      rowStep: grid.rowStep,
      interpolationType,
      outsideValue: NaN,
      numberOfComponents,
    });

    return startIndex;
  };
  const planeValues = isSum ? layer : combined;
  const outside = getOutsidePixels(
    volume,
    grid,
    sampleLayer(offsets[0], planeValues),
    width,
    height,
    planeValues,
    numberOfComponents
  );
  let missing = isSum ? addToSums(combined, layer, undefined) : undefined;

  for (let offsetIndex = 1; offsetIndex < offsets.length; offsetIndex++) {
    sampleLayer(offsets[offsetIndex], layer);

    if (isSum) {
      missing = addToSums(combined, layer, missing);
    } else if (isMax) {
      combineMaximum(combined, layer);
    } else {
      combineMinimum(combined, layer);
    }
  }

  const layerCount = offsets.length;
  const divide = slabType === SlabTypes.MEAN;

  for (let index = 0; index < valueCount; index++) {
    const pixelIndex =
      numberOfComponents === 1 ? index : Math.floor(index / numberOfComponents);

    if (outside?.[pixelIndex] === 1) {
      pixelData[index] = outsideValue;
      continue;
    }

    let value = combined[index];

    if (isSum) {
      const count = missing ? layerCount - missing[index] : layerCount;

      value = count === 0 ? NaN : divide ? value / count : value;
    }

    pixelData[index] = round ? Math.round(value) : value;
  }
}

/**
 * Samples the slice of a volume that a geometry from getVolumeSliceGeometry
 * describes, through sampleVolumeGrid. The pixels are in the array type of the
 * volume. A linear sample of an integer volume is rounded to the nearest whole
 * number, a sample of a float volume is not rounded.
 *
 * With a slab, each pixel combines several samples along the normal of the
 * slice with the maximum, the minimum or the average, as the GPU volume path
 * does with the vtk.js image reslice mapper (slab type from the blend mode as
 * in planarVolumeSliceBlendMode, no trapezoid integration, which core leaves
 * off). The sample positions are those of the mapper for a pixel whose
 * samples all lie in the volume, see getSlabSampleOffsets, and each sample is
 * taken with the interpolation type, as the texture of the mapper is read.
 * The average divides by the number of samples taken. The two differ in these
 * points:
 * - The mapper does not count a sample outside the volume, which moves the
 *   later samples of that pixel nearer to the plane. Here the positions stay
 *   the same and a sample outside the volume is left out, so the two differ
 *   only for a pixel whose slab leaves the volume.
 * - The mapper works in single precision on the GPU, and its average is a
 *   float. Here the average of an integer volume is rounded.
 * A slab of zero thickness, or of a blend mode without a slab type, gives the
 * plain slice.
 *
 * A volume of several components per voxel (an RGB or RGBA volume) gives as
 * many values per pixel, one after the other, each component sampled and
 * combined on its own.
 *
 * @returns The pixels and their lowest and highest value.
 */
function sampleVolumeSlice(
  options: SampleVolumeSliceOptions
): SampledVolumeSlice {
  const {
    volume,
    geometry,
    interpolationType = InterpolationType.NEAREST,
    outsideValue = 0,
    slab,
  } = options;
  const { width, height } = geometry;
  const ArrayType = volume.voxelManager.getConstructor();
  const numberOfComponents = getNumberOfComponents(volume);
  const length = width * height * numberOfComponents;
  const pixelData =
    options.pixelData instanceof ArrayType &&
    options.pixelData.length === length
      ? options.pixelData
      : (new ArrayType(length) as PixelDataTypedArray);
  const integers = holdsIntegers(ArrayType);
  const grid = getSliceGrid(volume, geometry);
  const slabType =
    slab && slab.thickness > 0
      ? mapBlendModeToSlabType(slab.blendMode)
      : undefined;
  const offsets =
    slabType === undefined ? [0] : getSlabSampleOffsets(volume, slab.thickness);

  if (offsets.length === 1) {
    const { min, max } = sampleVolumeGrid({
      volume,
      pixelData,
      width,
      height,
      startIndex: grid.startIndex,
      columnStep: grid.columnStep,
      rowStep: grid.rowStep,
      interpolationType,
      outsideValue,
      round: integers && interpolationType !== InterpolationType.NEAREST,
      numberOfComponents,
    });

    return { pixelData, min, max };
  }

  sampleSlab(
    volume,
    geometry,
    grid,
    offsets,
    slabType,
    interpolationType,
    pixelData,
    outsideValue,
    integers,
    numberOfComponents
  );

  return { pixelData, ...getValueRange(pixelData) };
}

export {
  sampleVolumeSlice as default,
  sampleVolumeSlice,
  getSlabSampleOffsets,
  getNumberOfComponents,
};
export type { SampleVolumeSliceOptions, SampledVolumeSlice, VolumeSliceSlab };
