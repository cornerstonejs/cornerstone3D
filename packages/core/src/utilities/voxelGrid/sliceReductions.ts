import type { Point3, VoxelGridReduction } from '../../types';
import type {
  BoxStatisticSource,
  BoxStatisticTarget,
  BoxStatisticValue,
} from './boxStatistic';
import resolveReduction from './resolveReduction';
import { foregroundMajorityOfBox } from './foregroundMajorityPlane';

/**
 * A slice of a source of several components interleaves them, so the slice fast
 * paths, which read one number per voxel, do not apply to it.
 */
function hasSeveralComponents(source: object) {
  return (
    ((source as { numberOfComponents?: number }).numberOfComponents ?? 1) > 1
  );
}

/** Reads one k slice of a source, or gives nothing. */
type SliceReader = (sliceIndex: number) => ArrayLike<number> | undefined;

/**
 * The slice reader of a fast path, or nothing when the source has none.
 *
 * `_getSliceView` gives the scalar data of the cached image itself, so a read
 * copies nothing. It gives nothing for an image that needs scaling, and
 * `_getSliceData` then scales a copy. `_getSliceData` comes before the public
 * `getSliceData`, because a missing image then gives nothing instead of a
 * plane that `getSliceData` composes voxel by voxel.
 */
function sliceReaderOf(
  source: object,
  { allowPublic }: { allowPublic: boolean }
): SliceReader | undefined {
  const view = (
    source as {
      _getSliceView?: (sliceIndex: number) => ArrayLike<number> | undefined;
    }
  )._getSliceView?.bind(source);
  const direct = (
    source as {
      _getSliceData?: (args: {
        sliceIndex: number;
        slicePlane: number;
      }) => ArrayLike<number> | undefined;
    }
  )._getSliceData?.bind(source);
  const fallback =
    direct ??
    (allowPublic
      ? (
          source as {
            getSliceData?: (args: {
              sliceIndex: number;
              slicePlane: number;
            }) => ArrayLike<number> | undefined;
          }
        ).getSliceData?.bind(source)
      : undefined);

  if (!fallback) {
    return undefined;
  }

  return (sliceIndex) =>
    view?.(sliceIndex) ?? fallback({ sliceIndex, slicePlane: 2 });
}

/** The array of a target, which the slice fast paths set directly. */
type DirectTarget = {
  scalars: { [index: number]: number };
  width: number;
  height: number;
};

/**
 * The array that a target keeps its voxels in, when it keeps them in one.
 *
 * A derived representation keeps its voxels in one array, and a write per voxel
 * through `setAtIJK` also records modified slices and bounds that nothing reads
 * for a derived representation. A fast path therefore sets the array, at a row
 * base that it computes once per row, and calls `setAtIJK` only when this gives
 * nothing (an RLE map, a cached expansion, a target with no array).
 */
function directTargetOf(target: object): DirectTarget | undefined {
  const scalars = (
    target as { getWritableScalarData?: () => ArrayLike<number> | undefined }
  ).getWritableScalarData?.() as DirectTarget['scalars'] | undefined;
  const [width, height] = (target as { dimensions?: Point3 }).dimensions ?? [];

  return scalars && width && height && !hasSeveralComponents(target)
    ? { scalars, width, height }
    : undefined;
}

/** The index of voxel (i, j, k) in the array of a direct target. */
function directIndexOf(
  { width, height }: DirectTarget,
  i: number,
  j: number,
  k: number
): number {
  return (k * height + j) * width + i;
}

/**
 * Fast path: the foreground majority of each box, read from whole XY slices.
 *
 * A labelmap reduces with this statistic, and the voxel by voxel path costs one
 * `getAtIJK` for each voxel and one accumulator reset for each box: about 90
 * seconds of blocked main thread for a 512 x 512 x 2464 labelmap. Each box
 * takes {@link foregroundMajorityOfBox}, which gives the result of the
 * accumulator.
 *
 * A scaled replicate of a progressive load comes back from `_getSliceData`
 * scaled to the full slice, so it stays on this path.
 *
 * @returns written count, or `undefined` when this path does not apply: no
 * slice reader, several components, a float slice, or a slice smaller than the
 * volume
 */
function reduceForegroundMajorityBySlices<T extends BoxStatisticValue = number>(
  source: BoxStatisticSource<T>,
  reduction: VoxelGridReduction,
  target: BoxStatisticTarget<T>
): number | undefined {
  const readSlice = sliceReaderOf(source, { allowPublic: false });

  if (!readSlice || hasSeveralComponents(source)) {
    return undefined;
  }

  const { factors, sourceOffset, sourceEnd, dimensions } = resolveReduction(
    source,
    reduction
  );
  const [factorI, factorJ, factorK] = factors;
  const [sourceWidth] = source.dimensions;
  const frameLength = sourceWidth * sourceEnd[1];
  const [targetI, targetJ, targetK] = reduction.targetOffset ?? [0, 0, 0];
  const labels: number[] = [];
  const counts: number[] = [];
  const frames: ArrayLike<number>[] = [];
  let written = 0;
  const direct = directTargetOf(target);

  for (let k = 0; k < dimensions[2]; k++) {
    const firstK = sourceOffset[2] + k * factorK;
    const endK = Math.min(firstK + factorK, sourceEnd[2]);

    frames.length = 0;

    for (let sourceK = firstK; sourceK < endK; sourceK++) {
      const frame = readSlice(sourceK);

      if (!frame) {
        continue;
      }

      // A float slice can hold NaN, which only the accumulator skips.
      if (
        frame.length < frameLength ||
        frame instanceof Float32Array ||
        frame instanceof Float64Array
      ) {
        return undefined;
      }

      frames.push(frame);
    }

    if (!frames.length) {
      continue;
    }

    for (let j = 0; j < dimensions[1]; j++) {
      const firstJ = sourceOffset[1] + j * factorJ;
      const endJ = Math.min(firstJ + factorJ, sourceEnd[1]);
      const base = direct
        ? directIndexOf(direct, targetI, targetJ + j, targetK + k)
        : 0;

      for (let i = 0; i < dimensions[0]; i++) {
        const firstI = sourceOffset[0] + i * factorI;
        const majority = foregroundMajorityOfBox(
          frames,
          sourceWidth,
          firstI,
          Math.min(firstI + factorI, sourceEnd[0]),
          firstJ,
          endJ,
          labels,
          counts
        );

        if (direct) {
          direct.scalars[base + i] = majority;
        } else {
          target.setAtIJK(targetI + i, targetJ + j, targetK + k, majority as T);
        }
        written++;
      }
    }
  }

  return written;
}

/**
 * Fast path: average whole XY slices when only K is reduced (`[1,1,Fk]`).
 * Image-volume sources expose `getSliceData` from cached image scalars.
 *
 * @returns written count, or `undefined` when this path does not apply
 */
function reduceAverageAlongKBySlices<T extends BoxStatisticValue = number>(
  source: BoxStatisticSource<T>,
  reduction: VoxelGridReduction,
  target: BoxStatisticTarget<T>,
  { round }: { round: boolean }
): number | undefined {
  if (
    (typeof (source as { _getSliceData?: unknown })._getSliceData !==
      'function' &&
      typeof source.getSliceData !== 'function') ||
    hasSeveralComponents(source)
  ) {
    return undefined;
  }

  const resolved = resolveReduction(source, reduction);
  const [factorI, factorJ, factorK] = resolved.factors;

  // A factor of 1 on the k axis reduces nothing, and the generic path copies
  // the voxels.
  if (factorI !== 1 || factorJ !== 1 || factorK <= 1) {
    return undefined;
  }

  const { sourceOffset, sourceEnd, dimensions: reducedDims } = resolved;
  const [sourceWidth] = source.dimensions;
  const [reducedWidth, reducedHeight, reducedDepth] = reducedDims;
  const [targetI, targetJ, targetK] = reduction.targetOffset ?? [0, 0, 0];

  if (
    sourceEnd[0] - sourceOffset[0] !== reducedWidth ||
    sourceEnd[1] - sourceOffset[1] !== reducedHeight
  ) {
    return undefined;
  }

  // The public `getSliceData` composes a missing voxel as 0, so it is safe
  // only over a source that holds every voxel in one array.
  const readSlice = sliceReaderOf(source, {
    allowPublic:
      (
        source as { getWritableScalarData?: () => unknown }
      ).getWritableScalarData?.() !== undefined,
  });

  if (!readSlice) {
    return undefined;
  }

  let written = 0;
  const direct = directTargetOf(target);
  const frames: ArrayLike<number>[] = [];

  // A streaming load refreshes one box per arriving frame, so this runs once
  // per frame: it allocates nothing, and it reads each voxel of the box once.
  for (let rk = 0; rk < reducedDepth; rk++) {
    const firstK = sourceOffset[2] + rk * factorK;
    const lastK = Math.min(firstK + factorK, sourceEnd[2]);

    frames.length = 0;

    for (let k = firstK; k < lastK; k++) {
      let frame: ArrayLike<number> | undefined;

      try {
        frame = readSlice(k);
      } catch {
        frame = undefined;
      }

      if (
        !frame ||
        frame.length < sourceWidth * (sourceOffset[1] + reducedHeight)
      ) {
        continue;
      }

      frames.push(frame);
    }

    if (!frames.length) {
      continue;
    }

    for (let j = 0; j < reducedHeight; j++) {
      const sourceRow = (sourceOffset[1] + j) * sourceWidth + sourceOffset[0];
      const base = direct
        ? directIndexOf(direct, targetI, targetJ + j, targetK + rk)
        : 0;

      for (let i = 0; i < reducedWidth; i++) {
        const index = sourceRow + i;
        let sum = 0;
        let count = 0;

        for (let m = 0; m < frames.length; m++) {
          const value = frames[m][index];

          if (Number.isFinite(value)) {
            sum += value;
            count++;
          }
        }

        if (!count) {
          continue;
        }

        const value = round ? Math.round(sum / count) : sum / count;

        if (direct) {
          direct.scalars[base + i] = value;
        } else {
          target.setAtIJK(targetI + i, targetJ + j, targetK + rk, value as T);
        }
        written++;
      }
    }
  }

  return written;
}

export { reduceForegroundMajorityBySlices, reduceAverageAlongKBySlices };
