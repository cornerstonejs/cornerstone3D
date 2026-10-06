/**
 * The target index of each source index along one axis, and the number of
 * source indices of each target index. The last target index also takes the
 * source indices beyond the last whole box.
 */
function boxIndices(
  sourceSize: number,
  size: number,
  factor: number
): { targetOf: Int32Array; counts: Int32Array } {
  const targetOf = new Int32Array(sourceSize);
  const counts = new Int32Array(size);

  for (let index = 0; index < sourceSize; index++) {
    const target = Math.min((index / factor) | 0, size - 1);

    targetOf[index] = target;
    counts[target]++;
  }

  return { targetOf, counts };
}

/**
 * Writes the box average of each box of a stack of source planes into one
 * reduced plane. A box that holds no source voxel gets 0, and an integer plane
 * gets the rounded value.
 *
 * The fill reads the frames by index, one target row at a time. The column of
 * each source voxel comes from a table, so the inner loop does one lookup and
 * one addition, and the counts come from the box sizes. A fill through the
 * composite maps every voxel through world coordinates, which measured 9 ms
 * for a slice of 256 x 256 and about 44 seconds for a volume of
 * 512 x 512 x 1232.
 *
 * @param frames - the source planes of the box along k that have arrived
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
  if (!frames.length) {
    for (let index = 0; index < width * height; index++) {
      values[index] = 0;
    }
    return;
  }

  const columns = boxIndices(sourceWidth, width, factorI);
  const rows = boxIndices(sourceHeight, height, factorJ);
  const round = !(
    values instanceof Float32Array || values instanceof Float64Array
  );
  const { targetOf } = columns;
  const sums = new Float64Array(width);
  let sourceRow = 0;

  for (let j = 0; j < height; j++) {
    const rowCount = rows.counts[j];

    sums.fill(0);

    for (const frame of frames) {
      for (let row = sourceRow; row < sourceRow + rowCount; row++) {
        const start = row * sourceWidth;

        for (let i = 0; i < sourceWidth; i++) {
          sums[targetOf[i]] += frame[start + i];
        }
      }
    }

    const boxRows = rowCount * frames.length;
    const targetRow = j * width;

    for (let i = 0; i < width; i++) {
      const count = columns.counts[i] * boxRows;
      const value = count ? sums[i] / count : 0;

      values[targetRow + i] = round ? Math.round(value) : value;
    }

    sourceRow += rowCount;
  }
}
