import { spansOfAxis, weightInSpan, type BoxSpan } from './boxSpan';

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
 * A voxel counts with its weight: the part of it that lies inside a box of a
 * fractional factor, which is 1 for every voxel of a box of a whole factor.
 *
 * A box holds few distinct labels, so the counts live in two short lists that
 * the caller reuses for every box, rather than in a map per box.
 *
 * @param frames - the source planes of the box along k, in k order
 * @param frameWeights - the weight of each frame, or nothing for 1
 * @param sourceWidth - the width of one source plane
 * @param spanI - the columns of the box
 * @param spanJ - the rows of the box
 * @param labels - scratch list of the labels of the box
 * @param counts - scratch list of the count of each label
 * @returns the majority label, or 0
 */
export function foregroundMajorityOfBox(
  frames: ArrayLike<number>[],
  frameWeights: number[] | undefined,
  sourceWidth: number,
  spanI: BoxSpan,
  spanJ: BoxSpan,
  labels: number[],
  counts: number[]
): number {
  let majority = 0;
  let majorityCount = 0;

  labels.length = 0;
  counts.length = 0;

  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    const frameWeight = frameWeights?.[f] ?? 1;

    for (let j = spanJ.first; j < spanJ.end; j++) {
      const row = j * sourceWidth;
      const rowWeight = frameWeight * weightInSpan(spanJ, j);

      for (let i = spanI.first; i < spanI.end; i++) {
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

        const count = (counts[slot] += rowWeight * weightInSpan(spanI, i));

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
 * beyond the last whole box. A factor can hold a fraction, as in
 * `fillPlaneByAverage`.
 *
 * @param frames - the source planes of the box along k, in k order
 * @param sourceSize - the width and height of one source plane
 * @param targetSize - the width and height of the reduced plane
 * @param factors - the box size along i and j
 * @param values - the reduced plane that receives the labels
 * @param frameWeights - the weight of each frame, 1 by default
 */
export default function fillPlaneByForegroundMajority(
  frames: ArrayLike<number>[],
  [sourceWidth, sourceHeight]: [number, number],
  [width, height]: [number, number],
  [factorI, factorJ]: [number, number],
  values: { [index: number]: number },
  frameWeights?: number[]
): void {
  const labels: number[] = [];
  const counts: number[] = [];
  const columns = spansOfAxis(sourceWidth, width, factorI);
  const rows = spansOfAxis(sourceHeight, height, factorJ);

  for (let targetJ = 0; targetJ < height; targetJ++) {
    for (let targetI = 0; targetI < width; targetI++) {
      values[targetJ * width + targetI] = foregroundMajorityOfBox(
        frames,
        frameWeights,
        sourceWidth,
        columns[targetI],
        rows[targetJ],
        labels,
        counts
      );
    }
  }
}
