/**
 * Gives the foreground majority of one box of a stack of source planes.
 *
 * This is the rule of the foreground majority accumulator, written for whole
 * planes. Background (0) does not compete: a box that holds any non-zero label
 * keeps the majority among those labels, and a box with no label gives 0. The
 * box is visited in k, then j, then i order, and a label takes the lead only
 * with a strictly greater count, so the texture fill, the slice fast path and
 * the accumulator agree on every tie.
 *
 * A box holds few distinct labels, so the counts live in two short lists that
 * the caller reuses for every box, rather than in a map per box.
 *
 * @param frames - the source planes of the box along k, in k order
 * @param sourceWidth - the width of one source plane
 * @param firstI - the first column of the box
 * @param endI - one past the last column of the box
 * @param firstJ - the first row of the box
 * @param endJ - one past the last row of the box
 * @param labels - scratch list of the labels of the box
 * @param counts - scratch list of the count of each label
 * @returns the majority label, or 0
 */
export function foregroundMajorityOfBox(
  frames: ArrayLike<number>[],
  sourceWidth: number,
  firstI: number,
  endI: number,
  firstJ: number,
  endJ: number,
  labels: number[],
  counts: number[]
): number {
  let majority = 0;
  let majorityCount = 0;

  labels.length = 0;
  counts.length = 0;

  for (const frame of frames) {
    for (let j = firstJ; j < endJ; j++) {
      const row = j * sourceWidth;

      for (let i = firstI; i < endI; i++) {
        const label = frame[row + i];

        if (label === 0) {
          continue;
        }

        let slot = labels.indexOf(label);

        if (slot === -1) {
          slot = labels.length;
          labels.push(label);
          counts.push(0);
        }

        const count = ++counts[slot];

        if (count > majorityCount) {
          majorityCount = count;
          majority = label;
        }
      }
    }
  }

  return majority;
}

/**
 * Writes the foreground majority of each box of a stack of source planes into
 * one reduced plane. See {@link foregroundMajorityOfBox} for the rule.
 *
 * The last column and row of the reduced plane also take the source voxels
 * beyond the last whole box.
 *
 * @param frames - the source planes of the box along k, in k order
 * @param sourceSize - the width and height of one source plane
 * @param targetSize - the width and height of the reduced plane
 * @param factors - the box size along i and j
 * @param values - the reduced plane that receives the labels
 */
export default function fillPlaneByForegroundMajority(
  frames: ArrayLike<number>[],
  [sourceWidth, sourceHeight]: [number, number],
  [width, height]: [number, number],
  [factorI, factorJ]: [number, number],
  values: { [index: number]: number }
): void {
  const labels: number[] = [];
  const counts: number[] = [];

  for (let targetJ = 0; targetJ < height; targetJ++) {
    const firstJ = targetJ * factorJ;
    const endJ =
      targetJ === height - 1
        ? sourceHeight
        : Math.min(firstJ + factorJ, sourceHeight);

    for (let targetI = 0; targetI < width; targetI++) {
      const firstI = targetI * factorI;
      const endI =
        targetI === width - 1
          ? sourceWidth
          : Math.min(firstI + factorI, sourceWidth);

      values[targetJ * width + targetI] = foregroundMajorityOfBox(
        frames,
        sourceWidth,
        firstI,
        endI,
        firstJ,
        endJ,
        labels,
        counts
      );
    }
  }
}
