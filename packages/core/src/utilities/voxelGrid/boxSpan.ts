/**
 * The source voxels of one box on one axis, and the weight of each one.
 *
 * A box covers the real interval `[lo, hi)` of the source edge coordinates, in
 * which source voxel `v` covers `[v, v + 1)`. A box of a whole factor at a whole
 * offset holds whole voxels of weight 1. A box of a fractional factor `N / M`
 * cuts the source voxels at its two ends, and each end voxel then has the
 * weight of the part of it that lies inside the box. Every voxel between the
 * two ends has the weight 1.
 */
export type BoxSpan = {
  /** The first source voxel that the box meets. */
  first: number;
  /** One past the last source voxel that the box meets. */
  end: number;
  /** The weight of `first`. */
  firstWeight: number;
  /** The weight of `end - 1`. */
  lastWeight: number;
};

// A bound this close to a whole number is that whole number, so the error of
// `j * N / M` never makes a voxel of weight 1e-12.
const SNAP = 1e-6;

/** Gives the whole number that `value` lies on, or `value` itself. */
function snapToWhole(value: number): number {
  const whole = Math.round(value);

  return Math.abs(value - whole) < SNAP ? whole : value;
}

/**
 * Gives the source voxels of the interval `[lo, hi)` and the weights of its two
 * end voxels.
 *
 * @param lo - the start of the box, in source edge coordinates
 * @param hi - the end of the box, in source edge coordinates
 * @returns the span, which is empty (`end <= first`) when `hi <= lo`
 */
function boxSpan(lo: number, hi: number): BoxSpan {
  const start = snapToWhole(lo);
  const stop = snapToWhole(hi);
  const first = Math.floor(start);
  const end = Math.max(first, Math.ceil(stop));

  if (end - first <= 1) {
    const weight = Math.max(0, stop - start);

    return { first, end, firstWeight: weight, lastWeight: weight };
  }

  return {
    first,
    end,
    firstWeight: first + 1 - start,
    lastWeight: stop - (end - 1),
  };
}

/** Gives the weight of source voxel `index` in a span. */
function weightInSpan(span: BoxSpan, index: number): number {
  if (index === span.first) {
    return span.firstWeight;
  }

  return index === span.end - 1 ? span.lastWeight : 1;
}

/**
 * Gives the span of box `index` on one axis of a reduction.
 *
 * @param start - the source edge coordinate where box 0 starts
 * @param factor - the number of source voxels of one box, which can hold a
 *     fraction
 * @param stop - the source edge coordinate where the region ends; the box is
 *     clipped there
 * @param index - the index of the box
 */
function spanOfBox(
  start: number,
  factor: number,
  stop: number,
  index: number
): BoxSpan {
  const lo = start + index * factor;

  return boxSpan(lo, Math.min(lo + factor, stop));
}

/**
 * The span of each cell of one axis of a reduced texture plane. Cell t covers
 * the source `[t * factor, (t + 1) * factor)`, and the last cell also takes the
 * source voxels beyond the last whole box.
 */
function spansOfAxis(
  sourceSize: number,
  size: number,
  factor: number
): BoxSpan[] {
  const spans: BoxSpan[] = [];

  for (let target = 0; target < size; target++) {
    const lo = Math.min(target * factor, sourceSize);
    const hi =
      target === size - 1 ? sourceSize : Math.min(lo + factor, sourceSize);

    spans.push(boxSpan(lo, hi));
  }

  return spans;
}

export { boxSpan, spanOfBox, spansOfAxis, weightInSpan, snapToWhole };
