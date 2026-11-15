import { InterpolationType } from '../enums';
import {
  NEAREST_VOXEL_TIE_EPSILON,
  SOURCE_SLICE_INDEX_TOLERANCE,
} from '../RenderingEngine/GenericViewport/Planar/planarCPUVolumeSamplingUtils';
import type { IImageVolume, PixelDataTypedArray, Point3 } from '../types';

const SPAN_MARGIN = 1e-7;
const MINIMUM_SPAN_STEP = 1e-12;

type SampledVolume = Pick<IImageVolume, 'dimensions' | 'voxelManager'>;

type SliceArray = PixelDataTypedArray | null;

type SampledValueRange = {
  min: number;
  max: number;
};

type ColumnSpan = {
  first: number;
  last: number;
};

type SampleVolumeGridOptions = {
  /**
   * The volume to read. It holds one component per voxel, or the number of
   * components that numberOfComponents gives.
   */
  volume: SampledVolume;
  /**
   * The array that receives one value per grid point, row after row, or
   * numberOfComponents values per grid point, one after the other.
   */
  pixelData: PixelDataTypedArray | number[];
  /**
   * The number of components of one voxel, for example 3 for RGB. Each
   * component is sampled as a volume of its own would be, with the same grid,
   * border, interpolation, limit and rounding rules, and the values of one grid
   * point are written one after the other. The default is 1.
   *
   * @experimental
   */
  numberOfComponents?: number;
  /** The number of grid points in one row. */
  width: number;
  /** The number of rows. */
  height: number;
  /** The continuous voxel index of the first grid point. */
  startIndex: Point3;
  /** The change of the voxel index from one grid point to the next in a row. */
  columnStep: Point3;
  /** The change of the voxel index from one row to the next. */
  rowStep: Point3;
  /**
   * NEAREST takes the nearest voxel. Any other type takes the trilinear
   * mix of the eight voxels around the grid point. The default is NEAREST.
   */
  interpolationType?: InterpolationType;
  /**
   * The value of a grid point outside the volume, and of a sample that is not
   * a finite number when valueRange is given. The default is 0.
   */
  outsideValue?: number;
  /** When given, each sample is limited to this range. */
  valueRange?: SampledValueRange;
  /** When true, each sample is rounded to the nearest whole number. */
  round?: boolean;
};

type GridSamplingContext = {
  volume: SampledVolume;
  volumeArray: PixelDataTypedArray | undefined;
  sliceArrays: Array<SliceArray | undefined>;
  columns: number;
  rows: number;
  slices: number;
  useNearest: boolean;
  outsideValue: number;
  limitValues: boolean;
  rangeMin: number;
  rangeMax: number;
  round: boolean;
};

/**
 * Returns the typed array that holds every voxel of the volume, when the
 * voxel manager of the volume keeps its voxels in one array of that size.
 */
function getVolumeArray(
  volume: SampledVolume,
  voxelCount: number
): PixelDataTypedArray | undefined {
  const scalarData = volume.voxelManager.getWritableScalarData?.();

  return scalarData?.length === voxelCount ? scalarData : undefined;
}

/**
 * Returns the typed array that holds the voxels of one slice of the volume,
 * or null when the slice has to be read one voxel at a time. A slice has such
 * an array when the volume keeps all its voxels in one typed array, or when
 * the voxel manager gives an unscaled view of the slice (_getSliceView) of the
 * slice size. Any other slice gives null. The answer is kept for the next read.
 */
function getSliceArray(
  context: GridSamplingContext,
  sliceIndex: number
): SliceArray {
  const known = context.sliceArrays[sliceIndex];

  if (known !== undefined) {
    return known;
  }

  const { volume, volumeArray, columns, rows } = context;
  const sliceSize = columns * rows;
  let sliceArray: SliceArray = null;

  if (volumeArray) {
    sliceArray = volumeArray.subarray(
      sliceIndex * sliceSize,
      (sliceIndex + 1) * sliceSize
    ) as PixelDataTypedArray;
  } else {
    // A voxel manager without _getSliceView is read through getAtIJK.
    const scalarData = (
      volume.voxelManager as {
        _getSliceView?: (sliceIndex: number) => PixelDataTypedArray | undefined;
      }
    )._getSliceView?.(sliceIndex);

    if (scalarData?.length === sliceSize) {
      sliceArray = scalarData;
    }
  }

  context.sliceArrays[sliceIndex] = sliceArray;

  return sliceArray;
}

/**
 * Limits a sample to the value range and rounds it, as the options ask. A
 * sample that is not a finite number becomes the outside value.
 */
function finishSample(context: GridSamplingContext, sample: number): number {
  let value = sample;

  if (context.limitValues) {
    if (!Number.isFinite(value)) {
      value = context.outsideValue;
    } else if (value < context.rangeMin) {
      value = context.rangeMin;
    } else if (value > context.rangeMax) {
      value = context.rangeMax;
    }
  }

  return context.round ? Math.round(value) : value;
}

/**
 * Whether a continuous voxel index lies on a voxel of a volume with these
 * dimensions: a voxel reaches half a voxel beyond its centre, and a point
 * within SOURCE_SLICE_INDEX_TOLERANCE of that edge counts as on it.
 * sampleVolumeGrid gives the outside value to a grid point exactly when this
 * is false.
 */
function isIndexInsideVolume(
  dimensions: ArrayLike<number>,
  i: number,
  j: number,
  k: number
): boolean {
  const lowerBound = -0.5 - SOURCE_SLICE_INDEX_TOLERANCE;

  return (
    i >= lowerBound &&
    i <= dimensions[0] - 0.5 + SOURCE_SLICE_INDEX_TOLERANCE &&
    j >= lowerBound &&
    j <= dimensions[1] - 0.5 + SOURCE_SLICE_INDEX_TOLERANCE &&
    k >= lowerBound &&
    k <= dimensions[2] - 0.5 + SOURCE_SLICE_INDEX_TOLERANCE
  );
}

/**
 * Samples one grid point with every check: whether the point lies on a voxel,
 * the move of its index onto the range of the voxel centers, and the reading
 * of a slice that has no typed array. The fast loops of sampleVolumeGrid skip
 * these checks for the grid points that are known to need none, and give the
 * same value there.
 */
function sampleCheckedPoint(
  context: GridSamplingContext,
  i: number,
  j: number,
  k: number
): number {
  const { columns, rows, slices } = context;

  if (!isIndexInsideVolume([columns, rows, slices], i, j, k)) {
    return context.outsideValue;
  }

  const { voxelManager } = context.volume;
  const lastI = columns - 1;
  const lastJ = rows - 1;
  const lastK = slices - 1;
  const clampedI = i < 0 ? 0 : i > lastI ? lastI : i;
  const clampedJ = j < 0 ? 0 : j > lastJ ? lastJ : j;
  const clampedK = k < 0 ? 0 : k > lastK ? lastK : k;

  if (context.useNearest) {
    const voxelI = Math.floor(clampedI + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
    const voxelJ = Math.floor(clampedJ + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
    const voxelK = Math.floor(clampedK + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
    const sliceArray = getSliceArray(context, voxelK);

    return finishSample(
      context,
      sliceArray
        ? sliceArray[voxelJ * columns + voxelI]
        : Number(voxelManager.getAtIJK(voxelI, voxelJ, voxelK))
    );
  }

  const i0 = Math.floor(clampedI);
  const j0 = Math.floor(clampedJ);
  const k0 = Math.floor(clampedK);
  const i1 = i0 < lastI ? i0 + 1 : lastI;
  const j1 = j0 < lastJ ? j0 + 1 : lastJ;
  const k1 = k0 < lastK ? k0 + 1 : lastK;
  const di = clampedI - i0;
  const dj = clampedJ - j0;
  const dk = clampedK - k0;
  const oneMinusDi = 1 - di;
  const oneMinusDj = 1 - dj;
  const oneMinusDk = 1 - dk;
  const lowerSlice = getSliceArray(context, k0);
  const upperSlice = getSliceArray(context, k1);
  let c000: number;
  let c100: number;
  let c010: number;
  let c110: number;
  let c001: number;
  let c101: number;
  let c011: number;
  let c111: number;

  if (lowerSlice && upperSlice) {
    c000 = lowerSlice[j0 * columns + i0];
    c100 = lowerSlice[j0 * columns + i1];
    c010 = lowerSlice[j1 * columns + i0];
    c110 = lowerSlice[j1 * columns + i1];
    c001 = upperSlice[j0 * columns + i0];
    c101 = upperSlice[j0 * columns + i1];
    c011 = upperSlice[j1 * columns + i0];
    c111 = upperSlice[j1 * columns + i1];
  } else {
    c000 = Number(voxelManager.getAtIJK(i0, j0, k0));
    c100 = Number(voxelManager.getAtIJK(i1, j0, k0));
    c010 = Number(voxelManager.getAtIJK(i0, j1, k0));
    c110 = Number(voxelManager.getAtIJK(i1, j1, k0));
    c001 = Number(voxelManager.getAtIJK(i0, j0, k1));
    c101 = Number(voxelManager.getAtIJK(i1, j0, k1));
    c011 = Number(voxelManager.getAtIJK(i0, j1, k1));
    c111 = Number(voxelManager.getAtIJK(i1, j1, k1));
  }

  const c00 = c000 * oneMinusDi + c100 * di;
  const c10 = c010 * oneMinusDi + c110 * di;
  const c01 = c001 * oneMinusDi + c101 * di;
  const c11 = c011 * oneMinusDi + c111 * di;
  const c0 = c00 * oneMinusDj + c10 * dj;
  const c1 = c01 * oneMinusDj + c11 * dj;

  return finishSample(context, c0 * oneMinusDk + c1 * dk);
}

/**
 * Narrows a span of columns to the columns where the coordinate
 * start + column * step lies between low and high. A step close to zero keeps
 * the span when start lies in the range, and empties it otherwise.
 */
function narrowColumnSpan(
  span: ColumnSpan,
  start: number,
  step: number,
  low: number,
  high: number
): void {
  if (Math.abs(step) < MINIMUM_SPAN_STEP) {
    if (start < low || start > high) {
      span.first = 1;
      span.last = 0;
    }

    return;
  }

  const atLow = (low - start) / step;
  const atHigh = (high - start) / step;
  const from = Math.ceil(atLow < atHigh ? atLow : atHigh);
  const to = Math.floor(atLow < atHigh ? atHigh : atLow);

  if (from > span.first) {
    span.first = from;
  }

  if (to < span.last) {
    span.last = to;
  }
}

/**
 * Returns the index axis along which a step moves, when it moves along one
 * axis only and by a whole number of voxels. Returns undefined otherwise.
 */
function getWholeStepAxis(step: Point3): number | undefined {
  let stepAxis: number | undefined;

  for (let axis = 0; axis < 3; axis++) {
    if (step[axis] === 0) {
      continue;
    }

    if (stepAxis !== undefined || !Number.isInteger(step[axis])) {
      return;
    }

    stepAxis = axis;
  }

  return stepAxis;
}

/**
 * Returns the first and the last of the count positions start + n * step
 * (n from 0 to count - 1) that lie between 0 and last, both whole numbers.
 * The span is empty (first > last) when none does.
 */
function getWholeSpan(
  start: number,
  step: number,
  last: number,
  count: number
): ColumnSpan {
  const atLow = -start / step;
  const atHigh = (last - start) / step;

  return {
    first: Math.max(0, Math.ceil(Math.min(atLow, atHigh))),
    last: Math.min(count - 1, Math.floor(Math.max(atLow, atHigh))),
  };
}

/**
 * Returns whether a slice array holds floating point values.
 */
function isFloatArray(sliceArray: PixelDataTypedArray): boolean {
  return (
    sliceArray instanceof Float32Array || sliceArray instanceof Float64Array
  );
}

/**
 * Writes the outside value into the pixels from first to last, both included.
 */
function fillOutside(
  pixelData: PixelDataTypedArray | number[],
  first: number,
  last: number,
  outsideValue: number
): void {
  for (let pixelIndex = first; pixelIndex <= last; pixelIndex++) {
    pixelData[pixelIndex] = outsideValue;
  }
}

/**
 * The short path of sampleVolumeGrid for a straight cut: the column step and
 * the row step each move along one index axis by a whole number of voxels,
 * along two different axes, and the start index is a whole number on those
 * two axes. Every grid point then lies on a voxel center in the plane of the
 * cut, and the third axis keeps one coordinate for the whole grid.
 *
 * When that coordinate is on a voxel center, or for a nearest sample, each
 * pixel is a copy of one voxel: a row of the grid that is a run of one slice
 * array is copied with TypedArray.set, any other row voxel by voxel. A linear
 * sample between two voxel centers mixes the two planes of voxels around the
 * coordinate with the weights and in the order of the general loop.
 *
 * It gives the same values and the same range as the general loop for every
 * volume of finite values, integer or float. Where it cannot promise that it
 * returns undefined, and the general loop then samples the whole grid: a
 * coordinate outside the volume on the third axis, and a slice without a
 * typed array.
 *
 * A voxel that is not finite (NaN, Infinity or -Infinity) affects only the
 * samples that really use it: the copy of that voxel, and a mix of two planes
 * in which it has a weight above zero. The general loop multiplies each of
 * the eight neighbours of a sample by its weight, also by a weight of zero,
 * and 0 x Infinity and 0 x NaN are NaN, so there such a voxel also turns its
 * neighbours into NaN. There is no GPU picture to match for such voxels: the
 * result of a linear texture filter with a texel that is not finite is
 * implementation defined.
 */
function sampleStraightCut(
  context: GridSamplingContext,
  options: SampleVolumeGridOptions
): SampledValueRange | undefined {
  const { pixelData, width, height, startIndex, columnStep, rowStep } = options;

  if (!(width > 0) || !(height > 0)) {
    return;
  }

  const columnAxis = getWholeStepAxis(columnStep);
  const rowAxis = getWholeStepAxis(rowStep);

  if (
    columnAxis === undefined ||
    rowAxis === undefined ||
    columnAxis === rowAxis ||
    !Number.isInteger(startIndex[columnAxis]) ||
    !Number.isInteger(startIndex[rowAxis])
  ) {
    return;
  }

  const { columns, slices, useNearest, outsideValue, sliceArrays } = context;
  const fixedAxis = 3 - columnAxis - rowAxis;
  const dimensions = [columns, context.rows, slices];
  const fixedLast = dimensions[fixedAxis] - 1;
  const fixedCoordinate = startIndex[fixedAxis];

  if (
    !(fixedCoordinate >= -0.5 - SOURCE_SLICE_INDEX_TOLERANCE) ||
    !(fixedCoordinate <= fixedLast + 0.5 + SOURCE_SLICE_INDEX_TOLERANCE)
  ) {
    return;
  }

  const clampedFixed =
    fixedCoordinate < 0
      ? 0
      : fixedCoordinate > fixedLast
        ? fixedLast
        : fixedCoordinate;
  const lowerPlane = useNearest
    ? Math.floor(clampedFixed + 0.5 - NEAREST_VOXEL_TIE_EPSILON)
    : Math.floor(clampedFixed);
  const upperPlane = lowerPlane < fixedLast ? lowerPlane + 1 : fixedLast;
  const weight = useNearest ? 0 : clampedFixed - lowerPlane;
  const oneMinusWeight = 1 - weight;
  const mix = weight > 0;
  const offsetStrides = [1, columns, 0];
  const sliceStrides = [0, 0, 1];
  const columnOffsetStep = columnStep[columnAxis] * offsetStrides[columnAxis];
  const columnSliceStep = columnStep[columnAxis] * sliceStrides[columnAxis];
  const mixOffset = (upperPlane - lowerPlane) * offsetStrides[fixedAxis];
  const mixSlice = (upperPlane - lowerPlane) * sliceStrides[fixedAxis];
  const canSetRuns =
    columnOffsetStep === 1 && !mix && ArrayBuffer.isView(pixelData);
  const columnSpan = getWholeSpan(
    startIndex[columnAxis],
    columnStep[columnAxis],
    dimensions[columnAxis] - 1,
    width
  );
  const rowSpan = getWholeSpan(
    startIndex[rowAxis],
    rowStep[rowAxis],
    dimensions[rowAxis] - 1,
    height
  );
  const runLength = columnSpan.last - columnSpan.first + 1;
  const coordinates = [0, 0, 0];
  let min = Infinity;
  let max = -Infinity;

  if (runLength <= 0 || rowSpan.first > rowSpan.last) {
    return;
  }

  for (let row = 0; row < height; row++) {
    const rowStart = row * width;

    if (row < rowSpan.first || row > rowSpan.last) {
      fillOutside(pixelData, rowStart, rowStart + width - 1, outsideValue);
      continue;
    }

    coordinates[fixedAxis] = lowerPlane;
    coordinates[rowAxis] = startIndex[rowAxis] + row * rowStep[rowAxis];
    coordinates[columnAxis] =
      startIndex[columnAxis] + columnSpan.first * columnStep[columnAxis];

    let offset = coordinates[1] * columns + coordinates[0];
    let sliceIndex = coordinates[2];
    let pixelIndex = rowStart + columnSpan.first;

    fillOutside(pixelData, rowStart, pixelIndex - 1, outsideValue);

    for (let column = 0; column < runLength; ) {
      const lowerSlice =
        sliceArrays[sliceIndex] ?? getSliceArray(context, sliceIndex);
      const upperSlice = mix
        ? (sliceArrays[sliceIndex + mixSlice] ??
          getSliceArray(context, sliceIndex + mixSlice))
        : lowerSlice;

      if (!lowerSlice || !upperSlice) {
        return;
      }

      const floatValues = isFloatArray(lowerSlice) || isFloatArray(upperSlice);
      const finish =
        context.limitValues || (context.round && (mix || floatValues));
      const count = columnSliceStep === 0 ? runLength : 1;

      const runEnd = offset + count * columnOffsetStep;

      if (canSetRuns && !finish) {
        (pixelData as PixelDataTypedArray).set(
          lowerSlice.subarray(offset, runEnd),
          pixelIndex
        );

        for (let read = offset; read < runEnd; read++) {
          const value = lowerSlice[read];

          if (value < min) {
            min = value;
          }

          if (value > max) {
            max = value;
          }
        }

        pixelIndex += count;
      } else if (!mix && !finish) {
        for (let index = 0, read = offset; index < count; index++) {
          const value = lowerSlice[read];

          pixelData[pixelIndex++] = value;

          if (value < min) {
            min = value;
          }

          if (value > max) {
            max = value;
          }

          read += columnOffsetStep;
        }
      } else if (!finish) {
        for (let index = 0, read = offset; index < count; index++) {
          const value =
            lowerSlice[read] * oneMinusWeight +
            upperSlice[read + mixOffset] * weight;

          pixelData[pixelIndex++] = value;

          if (value < min) {
            min = value;
          }

          if (value > max) {
            max = value;
          }

          read += columnOffsetStep;
        }
      } else if (!context.limitValues) {
        for (let index = 0, read = offset; index < count; index++) {
          const value = Math.round(
            mix
              ? lowerSlice[read] * oneMinusWeight +
                  upperSlice[read + mixOffset] * weight
              : lowerSlice[read]
          );

          pixelData[pixelIndex++] = value;

          if (value < min) {
            min = value;
          }

          if (value > max) {
            max = value;
          }

          read += columnOffsetStep;
        }
      } else {
        for (let index = 0, read = offset; index < count; index++) {
          let value = mix
            ? lowerSlice[read] * oneMinusWeight +
              upperSlice[read + mixOffset] * weight
            : lowerSlice[read];

          if (finish) {
            value = finishSample(context, value);
          }

          pixelData[pixelIndex++] = value;

          if (value < min) {
            min = value;
          }

          if (value > max) {
            max = value;
          }

          read += columnOffsetStep;
        }
      }

      offset = runEnd;
      column += count;
      sliceIndex += columnSliceStep;
    }

    fillOutside(pixelData, pixelIndex, rowStart + width - 1, outsideValue);
  }

  if (runLength < width || rowSpan.first > 0 || rowSpan.last < height - 1) {
    if (outsideValue < min) {
      min = outsideValue;
    }

    if (outsideValue > max) {
      max = outsideValue;
    }
  }

  return { min, max };
}

/**
 * Reads the components of one voxel into values, from offset on. A volume
 * whose voxel manager keeps every component of every voxel in one array is
 * read from that array. Any other volume is read through getAtIJK, which
 * gives the components of a voxel as an array; a component it does not give
 * reads 0, and a single number is the value of every component.
 */
function readVoxelComponents(
  volume: SampledVolume,
  componentArray: PixelDataTypedArray | undefined,
  numberOfComponents: number,
  i: number,
  j: number,
  k: number,
  values: Float64Array,
  offset: number
): void {
  const [columns, rows] = volume.dimensions;

  if (componentArray) {
    const first = ((k * rows + j) * columns + i) * numberOfComponents;

    for (let component = 0; component < numberOfComponents; component++) {
      values[offset + component] = componentArray[first + component];
    }

    return;
  }

  const voxel = volume.voxelManager.getAtIJK(i, j, k) as unknown;

  for (let component = 0; component < numberOfComponents; component++) {
    values[offset + component] = Array.isArray(voxel)
      ? Number(voxel[component] ?? 0)
      : Number(voxel);
  }
}

/**
 * The sampling of sampleVolumeGrid for a volume of several components per
 * voxel. It walks the grid as the general loop does, decides with
 * isIndexInsideVolume whether a grid point lies on a voxel, moves the index
 * onto the range of the voxel centers, and takes the nearest voxel or the
 * trilinear mix of the eight voxels around the point, with the weights and in
 * the order of sampleCheckedPoint, for each component. So each component gets
 * the values that sampleVolumeGrid gives for a volume of that component alone,
 * as long as the values are finite (the straight cut of a single component
 * leaves out the neighbours with a weight of zero, this loop does not).
 */
function sampleComponentGrid(
  context: GridSamplingContext,
  options: SampleVolumeGridOptions,
  numberOfComponents: number
): SampledValueRange {
  const { pixelData, width, height, startIndex, columnStep, rowStep } = options;
  const { volume, columns, rows, slices, outsideValue, useNearest } = context;
  const scalarData = volume.voxelManager.getWritableScalarData?.();
  const componentArray =
    scalarData?.length === columns * rows * slices * numberOfComponents
      ? scalarData
      : undefined;
  const finishValues = context.limitValues || context.round;
  const corners = new Float64Array(8 * numberOfComponents);
  const lastI = columns - 1;
  const lastJ = rows - 1;
  const lastK = slices - 1;
  const n = numberOfComponents;
  let rowI = startIndex[0];
  let rowJ = startIndex[1];
  let rowK = startIndex[2];
  let pixelIndex = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let row = 0; row < height; row++) {
    let i = rowI;
    let j = rowJ;
    let k = rowK;

    for (let column = 0; column < width; column++) {
      if (!isIndexInsideVolume(volume.dimensions, i, j, k)) {
        for (let component = 0; component < n; component++) {
          pixelData[pixelIndex++] = outsideValue;
        }

        if (outsideValue < min) {
          min = outsideValue;
        }

        if (outsideValue > max) {
          max = outsideValue;
        }

        i += columnStep[0];
        j += columnStep[1];
        k += columnStep[2];
        continue;
      }

      const clampedI = i < 0 ? 0 : i > lastI ? lastI : i;
      const clampedJ = j < 0 ? 0 : j > lastJ ? lastJ : j;
      const clampedK = k < 0 ? 0 : k > lastK ? lastK : k;

      if (useNearest) {
        readVoxelComponents(
          volume,
          componentArray,
          n,
          Math.floor(clampedI + 0.5 - NEAREST_VOXEL_TIE_EPSILON),
          Math.floor(clampedJ + 0.5 - NEAREST_VOXEL_TIE_EPSILON),
          Math.floor(clampedK + 0.5 - NEAREST_VOXEL_TIE_EPSILON),
          corners,
          0
        );
      } else {
        const i0 = Math.floor(clampedI);
        const j0 = Math.floor(clampedJ);
        const k0 = Math.floor(clampedK);
        const i1 = i0 < lastI ? i0 + 1 : lastI;
        const j1 = j0 < lastJ ? j0 + 1 : lastJ;
        const k1 = k0 < lastK ? k0 + 1 : lastK;
        const di = clampedI - i0;
        const dj = clampedJ - j0;
        const dk = clampedK - k0;
        const oneMinusDi = 1 - di;
        const oneMinusDj = 1 - dj;
        const oneMinusDk = 1 - dk;

        for (let corner = 0; corner < 8; corner++) {
          readVoxelComponents(
            volume,
            componentArray,
            n,
            corner & 1 ? i1 : i0,
            corner & 2 ? j1 : j0,
            corner & 4 ? k1 : k0,
            corners,
            corner * n
          );
        }

        for (let component = 0; component < n; component++) {
          const c00 =
            corners[component] * oneMinusDi + corners[n + component] * di;
          const c10 =
            corners[2 * n + component] * oneMinusDi +
            corners[3 * n + component] * di;
          const c01 =
            corners[4 * n + component] * oneMinusDi +
            corners[5 * n + component] * di;
          const c11 =
            corners[6 * n + component] * oneMinusDi +
            corners[7 * n + component] * di;
          const c0 = c00 * oneMinusDj + c10 * dj;
          const c1 = c01 * oneMinusDj + c11 * dj;

          corners[component] = c0 * oneMinusDk + c1 * dk;
        }
      }

      for (let component = 0; component < n; component++) {
        const value = finishValues
          ? finishSample(context, corners[component])
          : corners[component];

        pixelData[pixelIndex++] = value;

        if (value < min) {
          min = value;
        }

        if (value > max) {
          max = value;
        }
      }

      i += columnStep[0];
      j += columnStep[1];
      k += columnStep[2];
    }

    rowI += rowStep[0];
    rowJ += rowStep[1];
    rowK += rowStep[2];
  }

  return { min, max };
}

/**
 * Samples a volume on a regular grid of points and writes one value per grid
 * point into pixelData. The grid is given in continuous voxel indices: a first
 * point, a step along a row and a step from one row to the next. A grid in a
 * plane gives one slice image of the volume, in any orientation.
 *
 * A grid point counts as inside the volume while it lies on a voxel, which
 * reaches half a voxel beyond the center of the outermost voxels. The index of
 * such a point is first moved onto the range of the voxel centers, so a linear
 * sample near the border repeats the outermost voxel.
 *
 * Voxels are read straight from the typed array of a slice where there is
 * one, and through the voxel manager of the volume for any other slice. Both
 * ways give the same values.
 *
 * Each row is split into runs of columns. The columns that lie well inside
 * the volume are sampled in a loop without checks. The columns that are well
 * outside get the outside value. Only the few columns near the border of the
 * volume go through sampleCheckedPoint.
 *
 * A volume of several components per voxel (numberOfComponents above 1) is
 * sampled point by point by sampleComponentGrid, which gives each component
 * the values of this function for a volume of that component alone, for
 * finite values.
 *
 * @returns The lowest and the highest value written.
 */
function sampleVolumeGrid(options: SampleVolumeGridOptions): SampledValueRange {
  const {
    volume,
    pixelData,
    width,
    height,
    startIndex,
    columnStep,
    rowStep,
    interpolationType = InterpolationType.NEAREST,
    outsideValue = 0,
    valueRange,
    round = false,
    numberOfComponents = 1,
  } = options;
  const { voxelManager } = volume;
  const [columns, rows, slices] = volume.dimensions;
  const useNearest = interpolationType === InterpolationType.NEAREST;
  const limitValues = !!valueRange;
  const finishValues = limitValues || round;
  const context: GridSamplingContext = {
    volume,
    volumeArray: getVolumeArray(volume, columns * rows * slices),
    sliceArrays: new Array<SliceArray | undefined>(slices),
    columns,
    rows,
    slices,
    useNearest,
    outsideValue,
    limitValues,
    rangeMin: valueRange ? valueRange.min : 0,
    rangeMax: valueRange ? valueRange.max : 0,
    round,
  };

  if (numberOfComponents > 1) {
    return sampleComponentGrid(context, options, numberOfComponents);
  }

  const straightCut = sampleStraightCut(context, options);

  if (straightCut) {
    return straightCut;
  }

  const { sliceArrays } = context;
  const outerLow = -0.5 - SOURCE_SLICE_INDEX_TOLERANCE - SPAN_MARGIN;
  const outerHighOffset = -0.5 + SOURCE_SLICE_INDEX_TOLERANCE + SPAN_MARGIN;
  const innerLow = useNearest
    ? -0.5 + NEAREST_VOXEL_TIE_EPSILON + SPAN_MARGIN
    : SPAN_MARGIN;
  const innerHighOffset = useNearest
    ? -0.5 + NEAREST_VOXEL_TIE_EPSILON - SPAN_MARGIN
    : -1 - SPAN_MARGIN;
  const stepI = columnStep[0];
  const stepJ = columnStep[1];
  const stepK = columnStep[2];
  const outer: ColumnSpan = { first: 0, last: 0 };
  const inner: ColumnSpan = { first: 0, last: 0 };
  let rowI = startIndex[0];
  let rowJ = startIndex[1];
  let rowK = startIndex[2];
  let min = Infinity;
  let max = -Infinity;
  let wroteOutsideValue = false;
  let pixelIndex = 0;

  for (let row = 0; row < height; row++) {
    outer.first = 0;
    outer.last = width - 1;
    narrowColumnSpan(outer, rowI, stepI, outerLow, columns + outerHighOffset);
    narrowColumnSpan(outer, rowJ, stepJ, outerLow, rows + outerHighOffset);
    narrowColumnSpan(outer, rowK, stepK, outerLow, slices + outerHighOffset);

    const hasOuter = outer.first <= outer.last;
    const outerFirst = Math.max(0, outer.first - 1);
    const outerLast = Math.min(width - 1, outer.last + 1);

    inner.first = 0;
    inner.last = width - 1;
    narrowColumnSpan(inner, rowI, stepI, innerLow, columns + innerHighOffset);
    narrowColumnSpan(inner, rowJ, stepJ, innerLow, rows + innerHighOffset);
    narrowColumnSpan(inner, rowK, stepK, innerLow, slices + innerHighOffset);

    const innerFirst = inner.first + 1;
    const innerLast = inner.last - 1;
    const hasInner = hasOuter && innerFirst <= innerLast;
    const outsideEnd = hasOuter ? outerFirst : width;
    const checkedEnd = hasOuter ? outerLast + 1 : 0;
    const firstCheckedEnd = hasInner ? innerFirst : checkedEnd;
    let i = rowI;
    let j = rowJ;
    let k = rowK;
    let column = 0;

    if (outsideEnd > 0 || checkedEnd < width) {
      wroteOutsideValue = true;
    }

    for (; column < outsideEnd; column++) {
      pixelData[pixelIndex++] = outsideValue;
      i += stepI;
      j += stepJ;
      k += stepK;
    }

    for (; column < firstCheckedEnd; column++) {
      const value = sampleCheckedPoint(context, i, j, k);

      pixelData[pixelIndex++] = value;

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }

      i += stepI;
      j += stepJ;
      k += stepK;
    }

    if (hasInner && useNearest) {
      for (; column <= innerLast; column++) {
        const voxelI = Math.floor(i + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
        const voxelJ = Math.floor(j + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
        const voxelK = Math.floor(k + 0.5 - NEAREST_VOXEL_TIE_EPSILON);
        const sliceArray =
          sliceArrays[voxelK] ?? getSliceArray(context, voxelK);
        let value = sliceArray
          ? sliceArray[voxelJ * columns + voxelI]
          : Number(voxelManager.getAtIJK(voxelI, voxelJ, voxelK));

        if (finishValues) {
          value = finishSample(context, value);
        }

        pixelData[pixelIndex++] = value;

        if (value < min) {
          min = value;
        }

        if (value > max) {
          max = value;
        }

        i += stepI;
        j += stepJ;
        k += stepK;
      }
    } else if (hasInner) {
      for (; column <= innerLast; column++) {
        const i0 = Math.floor(i);
        const j0 = Math.floor(j);
        const k0 = Math.floor(k);
        const lowerSlice = sliceArrays[k0] ?? getSliceArray(context, k0);
        const upperSlice =
          sliceArrays[k0 + 1] ?? getSliceArray(context, k0 + 1);
        let value: number;

        if (lowerSlice && upperSlice) {
          const di = i - i0;
          const dj = j - j0;
          const dk = k - k0;
          const oneMinusDi = 1 - di;
          const oneMinusDj = 1 - dj;
          const oneMinusDk = 1 - dk;
          const lowerRow = j0 * columns + i0;
          const upperRow = lowerRow + columns;
          const c00 =
            lowerSlice[lowerRow] * oneMinusDi + lowerSlice[lowerRow + 1] * di;
          const c10 =
            lowerSlice[upperRow] * oneMinusDi + lowerSlice[upperRow + 1] * di;
          const c01 =
            upperSlice[lowerRow] * oneMinusDi + upperSlice[lowerRow + 1] * di;
          const c11 =
            upperSlice[upperRow] * oneMinusDi + upperSlice[upperRow + 1] * di;
          const c0 = c00 * oneMinusDj + c10 * dj;
          const c1 = c01 * oneMinusDj + c11 * dj;

          value = c0 * oneMinusDk + c1 * dk;

          if (finishValues) {
            value = finishSample(context, value);
          }
        } else {
          value = sampleCheckedPoint(context, i, j, k);
        }

        pixelData[pixelIndex++] = value;

        if (value < min) {
          min = value;
        }

        if (value > max) {
          max = value;
        }

        i += stepI;
        j += stepJ;
        k += stepK;
      }
    }

    for (; column < checkedEnd; column++) {
      const value = sampleCheckedPoint(context, i, j, k);

      pixelData[pixelIndex++] = value;

      if (value < min) {
        min = value;
      }

      if (value > max) {
        max = value;
      }

      i += stepI;
      j += stepJ;
      k += stepK;
    }

    for (; column < width; column++) {
      pixelData[pixelIndex++] = outsideValue;
    }

    rowI += rowStep[0];
    rowJ += rowStep[1];
    rowK += rowStep[2];
  }

  if (wroteOutsideValue) {
    if (outsideValue < min) {
      min = outsideValue;
    }

    if (outsideValue > max) {
      max = outsideValue;
    }
  }

  return { min, max };
}

export { sampleVolumeGrid as default, sampleVolumeGrid, isIndexInsideVolume };
export type { SampleVolumeGridOptions, SampledValueRange };
