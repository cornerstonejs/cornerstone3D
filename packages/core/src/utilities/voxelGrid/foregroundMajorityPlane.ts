/**
 * Writes the foreground majority of each box of a stack of source planes into
 * one reduced plane.
 *
 * Background (0) does not compete: a box that holds any non-zero label keeps
 * the majority among those labels, and a box with no label writes 0. Each box
 * is visited in k, then j, then i order and a label takes the lead only with a
 * strictly greater count, which is the tie rule of the foreground majority
 * accumulator, so the texture fill and the derived representation agree.
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
  // One map for every box: a map for each box of a 256 x 256 plane allocated
  // 65536 maps per slice.
  const counts = new Map<number, number>();

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
      let majority = 0;
      let majorityCount = 0;

      counts.clear();

      for (const frame of frames) {
        for (let j = firstJ; j < endJ; j++) {
          const row = j * sourceWidth;

          for (let i = firstI; i < endI; i++) {
            const label = frame[row + i];

            if (label === 0) {
              continue;
            }

            const count = (counts.get(label) ?? 0) + 1;

            counts.set(label, count);

            if (count > majorityCount) {
              majorityCount = count;
              majority = label;
            }
          }
        }
      }

      values[targetJ * width + targetI] = majority;
    }
  }
}
