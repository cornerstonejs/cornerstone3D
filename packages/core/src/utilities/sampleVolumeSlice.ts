import { SlabTypes } from '@kitware/vtk.js/Rendering/Core/ImageResliceMapper/Constants';
import { vec3 } from 'gl-matrix';
import InterpolationType from '../enums/InterpolationType';
import type BlendModes from '../enums/BlendModes';
import { SOURCE_SLICE_INDEX_TOLERANCE } from '../RenderingEngine/Viewports/Planar/planarCPUVolumeSamplingUtils';
import { mapBlendModeToSlabType } from '../RenderingEngine/Viewports/Planar/planarVolumeSliceBlendMode';
import type { IImageVolume, PixelDataTypedArray, Point3 } from '../types';
import sampleVolumeGrid, {
  getFrameArray,
  isIndexInsideVolume,
  sampleStraightCutGrid,
} from './sampleVolumeGrid';
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
  /**
   * When true, a sample of an integer volume that mixes voxels keeps its
   * fraction: the pixels are a Float32Array and are not rounded. A sample
   * mixes voxels when it is linear and its grid does not lie on voxel
   * centres, when it is a linear slab, or when it is an average slab. Any
   * other sample, such as a straight cut on a slice of voxels, keeps the
   * array type of the volume. Default false, which rounds such a sample.
   */
  keepFractions?: boolean;
};

type SampledVolumeSlice = {
  pixelData: PixelDataTypedArray;
  min: number;
  max: number;
};

type SliceArrayType = new (length: number) => PixelDataTypedArray;

const WHOLE_INDEX_EPSILON = 1e-9;

/**
 * The largest index change per millimetre of the slab normal, and the largest
 * change of the slab axis coordinate across a grid, that still count as none
 * for a straight cut. It is far above the rounding of the world to index
 * transform and far below the tilt of any view that is not along an axis.
 */
const STRAIGHT_SLAB_EPSILON = 1e-6;

type SliceGrid = {
  startIndex: Point3;
  columnStep: Point3;
  rowStep: Point3;
  normalStep: Point3;
};

/** What a sample of a slice takes and gives, before any voxel is read. */
type SlicePlan = {
  grid: SliceGrid;
  slabType?: SlabTypes;
  /** The distances along the normal of the layers that are sampled, 0 first. */
  offsets: number[];
  ArrayType: SliceArrayType;
  round: boolean;
};

/** The range of layer offsets that can reach the volume. */
type LayerReach = {
  low: number;
  high: number;
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
 * Returns the index axis that the slab of a grid moves along, when the slab
 * of every pixel crosses the same slices of voxels: the normal moves along
 * that axis only, and the grid keeps one coordinate on it. That is so for a
 * cut whose rows and columns follow two volume axes of a volume whose axes
 * are at right angles. Returns -1 for any other grid.
 */
function getStraightSlabAxis(
  grid: SliceGrid,
  width: number,
  height: number
): number {
  const { normalStep, columnStep, rowStep } = grid;
  const axes = [0, 1, 2].filter(
    (axis) => Math.abs(normalStep[axis]) > STRAIGHT_SLAB_EPSILON
  );

  if (axes.length !== 1) {
    return -1;
  }

  const [axis] = axes;
  const drift =
    Math.abs(columnStep[axis]) * Math.max(0, width - 1) +
    Math.abs(rowStep[axis]) * Math.max(0, height - 1);

  return drift <= STRAIGHT_SLAB_EPSILON ? axis : -1;
}

/**
 * Returns the slab offsets of a straight cut (see getStraightSlabAxis), as
 * the shader of the vtk.js image reslice mapper (vtk.js 36,
 * getSlabSampleLoopLines) takes them for a pixel inside the volume. Every
 * such pixel takes the same samples, so one pass along the normal gives them.
 *
 * The shader starts with the sample on the plane and a counter of 1, and
 * steps by half the smallest voxel spacing. Each turn of its loop adds one
 * step to the distance it counts and tests a pair of positions, the counter
 * times the step on the negative side of the normal first, then on the
 * positive side, both with the counter of the start of the turn. A position
 * inside the volume is sampled and adds 1 to the counter; a position outside
 * is left out and adds nothing, so near a face of the volume the later
 * samples lie closer together than deep inside. When the counted distance
 * passes half the thickness, the last pair lies at exactly half the
 * thickness. The loop stops there, or once a position outside the volume has
 * been seen on both sides before that last pair. A position is inside when
 * its texture coordinate lies from 0 to 1, that is a voxel index from -0.5
 * to the size minus 0.5, both included, up to WHOLE_INDEX_EPSILON for the
 * rounding of the index.
 *
 * For a slab that stays inside the volume these are the offsets of
 * getSlabSampleOffsets, in the same order.
 */
function getStraightCutSlabOffsets(
  volume: IImageVolume,
  grid: SliceGrid,
  axis: number,
  thickness: number
): number[] {
  const offsets = [0];
  const halfThickness = thickness / 2;
  const step = Math.min(...volume.spacing) / 2;

  if (!(halfThickness > step) || !(step > 0)) {
    return offsets;
  }

  const start = grid.startIndex[axis];
  const indexPerMillimetre = grid.normalStep[axis];
  const lowest = -0.5 - WHOLE_INDEX_EPSILON;
  const highest = volume.dimensions[axis] - 0.5 + WHOLE_INDEX_EPSILON;
  const isInside = (offset: number) => {
    const coordinate = start + offset * indexPerMillimetre;

    return coordinate >= lowest && coordinate <= highest;
  };
  let sampleCount = 1;
  let distance = step;
  let negativeExited = false;
  let positiveExited = false;

  while (distance < halfThickness && !(negativeExited && positiveExited)) {
    distance += step;

    const atBoundary = distance > halfThickness;
    const offset = atBoundary ? halfThickness : sampleCount * step;

    if (isInside(-offset)) {
      offsets.push(-offset);
      sampleCount++;
    } else if (!atBoundary) {
      negativeExited = true;
    }

    if (isInside(offset)) {
      offsets.push(offset);
      sampleCount++;
    } else if (!atBoundary) {
      positiveExited = true;
    }
  }

  return offsets;
}

/**
 * Returns the range of layer offsets whose layer can hold a sample inside the
 * volume, for any pixel, or undefined when the grid has no plane. A layer is
 * the plane of the grid moved along the normal; its offset at a point is
 * found in voxel index space from the normal of the grid there. The range is
 * that of the eight corners of a box half a voxel larger than the volume on
 * each side, so a layer outside it lies at least half a voxel outside the
 * volume, which no rounding reaches.
 */
function getLayerReach(
  volume: IImageVolume,
  grid: SliceGrid
): LayerReach | undefined {
  const { startIndex, normalStep } = grid;
  const gridNormal = vec3.cross(
    [0, 0, 0] as unknown as vec3,
    grid.columnStep as unknown as vec3,
    grid.rowStep as unknown as vec3
  );
  const normalLevel = vec3.dot(normalStep as unknown as vec3, gridNormal);

  if (!(Math.abs(normalLevel) > 0) || !Number.isFinite(normalLevel)) {
    return;
  }

  const { dimensions } = volume;
  let low = Infinity;
  let high = -Infinity;

  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex++) {
    const corner = [0, 1, 2].map((axis) =>
      cornerIndex & (1 << axis) ? dimensions[axis] : -1
    );
    const level =
      ((corner[0] - startIndex[0]) * gridNormal[0] +
        (corner[1] - startIndex[1]) * gridNormal[1] +
        (corner[2] - startIndex[2]) * gridNormal[2]) /
      normalLevel;

    low = Math.min(low, level);
    high = Math.max(high, level);
  }

  return { low, high };
}

/**
 * Returns the slab offsets of an oblique cut: those of getSlabSampleOffsets,
 * without the layers that cannot reach the volume for any pixel (see
 * getLayerReach), which would give no sample. So a slab far thicker than the
 * volume costs the layers that cut the volume only. Half the thickness is
 * first limited to the farthest reach plus two steps, so the list is never
 * made in proportion to an absurd thickness: up to there the list is that of
 * the full thickness, and the offsets that the limit changes or drops all lie
 * beyond the reach.
 */
function getObliqueSlabOffsets(
  volume: IImageVolume,
  grid: SliceGrid,
  thickness: number
): number[] {
  const reach = getLayerReach(volume, grid);

  if (!reach) {
    return getSlabSampleOffsets(volume, thickness);
  }

  const step = Math.min(...volume.spacing) / 2;
  const farthest = Math.max(-reach.low, reach.high, 0);
  const halfThickness = Math.min(thickness / 2, farthest + 2 * step);

  return getSlabSampleOffsets(volume, 2 * halfThickness).filter(
    (offset, index) =>
      index === 0 || (offset >= reach.low && offset <= reach.high)
  );
}

/**
 * Returns the offsets of the slab layers of a grid that are sampled: those
 * of the reslice shader for a straight cut (getStraightCutSlabOffsets), and
 * the fixed offsets of a pixel deep inside for any other cut, without the
 * layers that miss the volume (getObliqueSlabOffsets).
 */
function getSlabLayerOffsets(
  volume: IImageVolume,
  geometry: VolumeSliceGeometry,
  grid: SliceGrid,
  thickness: number
): number[] {
  const axis = getStraightSlabAxis(grid, geometry.width, geometry.height);

  if (axis >= 0) {
    return getStraightCutSlabOffsets(volume, grid, axis, thickness);
  }

  return getObliqueSlabOffsets(volume, grid, thickness);
}

/**
 * Returns whether every point of a grid lies on a voxel centre: a whole
 * start index and whole steps.
 */
function isOnVoxelCentres(grid: SliceGrid): boolean {
  return [grid.startIndex, grid.columnStep, grid.rowStep].every((vector) =>
    vector.every((value) => Number.isInteger(value))
  );
}

/**
 * Plans the sample of a slice: its grid, its slab layers, the array type of
 * its pixels and whether they are rounded (see sampleVolumeSlice).
 */
function planVolumeSlice(options: SampleVolumeSliceOptions): SlicePlan {
  const {
    volume,
    geometry,
    interpolationType = InterpolationType.NEAREST,
    slab,
    keepFractions = false,
  } = options;
  const VolumeArrayType = volume.voxelManager.getConstructor();
  const grid = getSliceGrid(volume, geometry);
  const slabType =
    slab && slab.thickness > 0
      ? mapBlendModeToSlabType(slab.blendMode)
      : undefined;
  const offsets =
    slabType === undefined
      ? [0]
      : getSlabLayerOffsets(volume, geometry, grid, slab.thickness);
  const integers = holdsIntegers(VolumeArrayType);
  const linear = interpolationType !== InterpolationType.NEAREST;
  const isSlab = offsets.length > 1;
  const mixes =
    (linear && (isSlab || !isOnVoxelCentres(grid))) ||
    (isSlab && slabType === SlabTypes.MEAN);
  const fractions = keepFractions && integers && mixes;

  return {
    grid,
    slabType,
    offsets,
    ArrayType: fractions ? Float32Array : VolumeArrayType,
    round: integers && !fractions && (isSlab || linear),
  };
}

/**
 * Returns the array type of the pixels that sampleVolumeSlice gives for these
 * options, without sampling: the array type of the volume, or Float32Array
 * for a sample of an integer volume that keeps its fractions (see
 * `keepFractions`).
 */
function getVolumeSliceArrayType(
  options: SampleVolumeSliceOptions
): SliceArrayType {
  return planVolumeSlice(options).ArrayType;
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
 * describes, through sampleVolumeGrid. A sample of a float volume is never
 * rounded. For an integer volume:
 * - Without keepFractions (the default) the pixels are in the array type of
 *   the volume, and a linear sample and any slab are rounded to the nearest
 *   whole number.
 * - With keepFractions, a sample that mixes voxels (a linear sample whose
 *   grid does not lie on voxel centres, a linear slab or an average slab) is
 *   a Float32Array and is not rounded, as the GPU volume path keeps the
 *   fraction. Any other sample, such as a straight cut on a slice of voxels
 *   or a nearest maximum slab, is in the array type of the volume and holds
 *   whole numbers already. getVolumeSliceArrayType gives the array type.
 *
 * With a slab, each pixel combines several samples along the normal of the
 * slice with the maximum, the minimum or the average, as the GPU volume path
 * does with the vtk.js image reslice mapper (slab type from the blend mode as
 * in planarVolumeSliceBlendMode, no trapezoid integration, which core leaves
 * off). Each sample is taken with the interpolation type, as the texture of
 * the mapper is read, and the average divides by the number of samples taken.
 * The sample positions are those of the mapper:
 * - For a straight cut, whose rows and columns follow two axes of a volume
 *   with axes at right angles, they are those of the shader for every pixel,
 *   also near a face of the volume, where the shader moves its later samples
 *   closer together (getStraightCutSlabOffsets).
 * - For any other cut they are those of a pixel whose samples all lie in the
 *   volume (getSlabSampleOffsets), and a sample outside the volume is left
 *   out. The mapper does not count such a sample and moves the later samples
 *   of that pixel nearer to the plane, so the two differ for a pixel whose
 *   slab leaves the volume. The layers that miss the volume for every pixel
 *   are not sampled (getObliqueSlabOffsets), so the work stays bounded for any
 *   thickness and the values do not change.
 * The mapper works in single precision on the GPU, and its average is a
 * float. Without keepFractions the average of an integer volume is rounded.
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
  } = options;
  const { width, height } = geometry;
  const { grid, slabType, offsets, ArrayType, round } =
    planVolumeSlice(options);
  const numberOfComponents = getNumberOfComponents(volume);
  const length = width * height * numberOfComponents;
  const pixelData =
    options.pixelData instanceof ArrayType &&
    options.pixelData.length === length
      ? options.pixelData
      : (new ArrayType(length) as PixelDataTypedArray);

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
      round,
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
    round,
    numberOfComponents
  );

  return { pixelData, ...getValueRange(pixelData) };
}

/**
 * Returns whether a step moves by exactly one voxel along an axis and not at
 * all along the others.
 */
function isUnitStepAlong(step: Point3, axis: number): boolean {
  return step.every((value, index) => value === (index === axis ? 1 : 0));
}

/**
 * The frame of the volume that a slice is, as the volume holds it: the slice
 * of the acquisition plane (its normal along the frame axis, the k axis of
 * the volume) on the centre of a frame, with no slab, whose columns and rows
 * are those of the frame in the order of the frame (`getFrameArray`), and
 * whose array type is the one that a sample of it gives. The draw step can
 * show that array as it is: nothing is sampled and nothing copied.
 *
 * Undefined for any other slice. A slice of the acquisition plane is still
 * gathered (`gatherVolumeSlice`), one copy, for a frame seen from its back,
 * whose rows run the other way along j, for a frame held in an array of
 * another type than the slice (the type of the volume), and for a frame
 * held in no array of the frame size (`getFrameArray` gives none: a frame
 * that has not arrived reads as zeros).
 */
function getFrameOfVolumeSlice(
  options: SampleVolumeSliceOptions
): PixelDataTypedArray | undefined {
  const { volume, geometry } = options;

  if (getNumberOfComponents(volume) !== 1) {
    return;
  }

  const { grid, offsets, ArrayType } = planVolumeSlice(options);
  const { startIndex, columnStep, rowStep } = grid;
  const [columns, rows] = volume.dimensions;

  if (
    offsets.length !== 1 ||
    geometry.width !== columns ||
    geometry.height !== rows ||
    !isUnitStepAlong(columnStep, 0) ||
    !isUnitStepAlong(rowStep, 1) ||
    startIndex[0] !== 0 ||
    startIndex[1] !== 0 ||
    !Number.isInteger(startIndex[2])
  ) {
    return;
  }

  const frame = getFrameArray(volume, startIndex[2]);

  return frame?.constructor === ArrayType ? frame : undefined;
}

/**
 * Samples a slice whose grid is a straight cut of the volume, with no slab:
 * a plane of the voxel grid (the acquisition plane or one of the two planes
 * across the frames), on voxel centres or between two planes of voxels, as
 * an overlay on another volume's plane lies. Each pixel is a copy of one
 * voxel, or the mix of the two voxels on either side of the plane, read from
 * the arrays of the frames (`sampleStraightCutGrid`): the values that
 * `sampleVolumeSlice` gives, with no call of its general loop. Only the rows
 * from `firstRow` on, `rowCount` of them, are written; a plane across the
 * frames has one row per frame, so a frame that arrives changes one row. With
 * `rowRanges`, the lowest and highest value of each row written is kept
 * there, from index 0 for `firstRow`.
 *
 * @returns the pixels and the lowest and highest value of the rows written,
 *   or undefined for a slice that is not such a cut, has a slab, has several
 *   components or reads a frame held in no array: `sampleVolumeSlice`
 *   samples that one.
 */
function gatherVolumeSlice(
  options: SampleVolumeSliceOptions,
  firstRow = 0,
  rowCount = options.geometry.height,
  rowRanges?: { min: Float64Array; max: Float64Array }
): SampledVolumeSlice | undefined {
  const {
    volume,
    geometry,
    interpolationType = InterpolationType.NEAREST,
    outsideValue = 0,
  } = options;

  if (getNumberOfComponents(volume) !== 1) {
    return;
  }

  const { grid, offsets, ArrayType, round } = planVolumeSlice(options);

  if (offsets.length !== 1) {
    return;
  }

  const { width, height } = geometry;
  const length = width * height;
  const pixelData =
    options.pixelData instanceof ArrayType &&
    options.pixelData.length === length
      ? options.pixelData
      : (new ArrayType(length) as PixelDataTypedArray);
  const { startIndex, rowStep, columnStep } = grid;
  const range = sampleStraightCutGrid(
    {
      volume,
      pixelData: pixelData.subarray(
        firstRow * width,
        (firstRow + rowCount) * width
      ) as PixelDataTypedArray,
      width,
      height: rowCount,
      startIndex: [
        startIndex[0] + firstRow * rowStep[0],
        startIndex[1] + firstRow * rowStep[1],
        startIndex[2] + firstRow * rowStep[2],
      ],
      columnStep,
      rowStep,
      interpolationType,
      outsideValue,
      round,
    },
    rowRanges
  );

  return range && { pixelData, ...range };
}

/**
 * The frame that each row of a slice reads, when each row of the slice reads
 * one frame: a straight cut across the frames (its rows follow the frame
 * axis, the k axis, by whole frames, as the two planes of the voxel grid
 * across the frames do), with no slab. Row r reads frame
 * `firstFrame + r * frameStep`. Undefined for any other slice.
 */
function getVolumeSliceFrameRows(
  options: SampleVolumeSliceOptions
): { firstFrame: number; frameStep: number } | undefined {
  const { grid, offsets } = planVolumeSlice(options);
  const { startIndex, rowStep, columnStep } = grid;

  if (
    offsets.length !== 1 ||
    getStepAxis(rowStep) !== 2 ||
    !Number.isInteger(rowStep[2]) ||
    columnStep[2] !== 0 ||
    !Number.isInteger(startIndex[2])
  ) {
    return;
  }

  return { firstFrame: startIndex[2], frameStep: rowStep[2] };
}

/**
 * The frames (k slices) of the volume that a sample of a slice can read: from
 * the lowest to the highest frame that a pixel of the slice, or a layer of its
 * slab, reaches, each fractional frame index widened to the frames on both
 * sides of it, which a linear sample mixes, and clamped to the frames of the
 * volume. The frame index is linear across the grid, so the corners of the
 * grid hold its extremes. Undefined when the slice reaches no frame of the
 * volume.
 */
function getVolumeSliceFrameSpan(
  options: SampleVolumeSliceOptions
): { first: number; last: number } | undefined {
  const { volume, geometry } = options;
  const { grid, offsets } = planVolumeSlice(options);
  const { startIndex, columnStep, rowStep, normalStep } = grid;
  const columnReach = (geometry.width - 1) * columnStep[2];
  const rowReach = (geometry.height - 1) * rowStep[2];
  const layerReaches = offsets.map((offset) => offset * normalStep[2]);
  let low = Infinity;
  let high = -Infinity;

  for (const corner of [0, columnReach, rowReach, columnReach + rowReach]) {
    for (const layer of layerReaches) {
      const frame = startIndex[2] + corner + layer;

      low = Math.min(low, frame);
      high = Math.max(high, frame);
    }
  }

  const first = Math.max(0, Math.floor(low));
  const last = Math.min(volume.dimensions[2] - 1, Math.ceil(high));

  return first <= last ? { first, last } : undefined;
}

export {
  sampleVolumeSlice as default,
  sampleVolumeSlice,
  getFrameOfVolumeSlice,
  gatherVolumeSlice,
  getVolumeSliceFrameRows,
  getVolumeSliceFrameSpan,
  getValueRange,
  getSlabSampleOffsets,
  getNumberOfComponents,
  getVolumeSliceArrayType,
};
export type { SampleVolumeSliceOptions, SampledVolumeSlice, VolumeSliceSlab };
