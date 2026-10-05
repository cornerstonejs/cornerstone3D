/**
 * Writes the box average of each box of a stack of source planes into one
 * reduced plane. A box that holds no source voxel gets 0.
 *
 * The arithmetic reads the frames by index. A fill through the composite maps
 * every voxel through world coordinates, which measured 9 ms for a slice of
 * 256 x 256 and about 44 seconds for a volume of 512 x 512 x 1232.
 *
 * The last column and row of the reduced plane also take the source voxels
 * beyond the last whole box.
 *
 * @param frames - the source planes of the box along k
 * @param sourceSize - the width and height of one source plane
 * @param targetSize - the width and height of the reduced plane
 * @param factors - the box size along i and j
 * @param values - the reduced plane that receives the averages
 */
export default function fillPlaneByAverage(
  frames: ArrayLike<number>[],
  [sourceWidth, sourceHeight]: [number, number],
  [width, height]: [number, number],
  [factorI, factorJ]: [number, number],
  values: { [index: number]: number }
): void {
  const sums = new Float64Array(width * height);
  const counts = new Float64Array(width * height);

  for (const frame of frames) {
    for (let j = 0; j < sourceHeight; j++) {
      const targetRow = Math.min((j / factorJ) | 0, height - 1) * width;
      const sourceRow = j * sourceWidth;

      for (let i = 0; i < sourceWidth; i++) {
        const targetIndex = targetRow + Math.min((i / factorI) | 0, width - 1);

        sums[targetIndex] += frame[sourceRow + i];
        counts[targetIndex] += 1;
      }
    }
  }

  for (let index = 0; index < sums.length; index++) {
    values[index] = counts[index] ? sums[index] / counts[index] : 0;
  }
}
