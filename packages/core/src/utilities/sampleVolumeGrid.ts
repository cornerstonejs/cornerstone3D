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
  /** The volume to read. It must hold one component per voxel. */
  volume: SampledVolume;
  /** The array that receives one value per grid point, row after row. */
  pixelData: PixelDataTypedArray | number[];
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
    // A voxel manager without _getSliceView (a dynamic volume) is read
    // through getAtIJK, which follows its current dimension group.
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
  const lowerBound = -0.5 - SOURCE_SLICE_INDEX_TOLERANCE;

  if (
    !(
      i >= lowerBound &&
      i <= columns - 0.5 + SOURCE_SLICE_INDEX_TOLERANCE &&
      j >= lowerBound &&
      j <= rows - 0.5 + SOURCE_SLICE_INDEX_TOLERANCE &&
      k >= lowerBound &&
      k <= slices - 0.5 + SOURCE_SLICE_INDEX_TOLERANCE
    )
  ) {
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

export { sampleVolumeGrid as default, sampleVolumeGrid };
export type { SampleVolumeGridOptions, SampledValueRange };
