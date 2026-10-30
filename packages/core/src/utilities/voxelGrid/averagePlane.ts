import { spansOfAxis, weightInSpan } from './boxSpan';

/**
 * Writes the box average of each box of a stack of source planes into one
 * reduced plane. A box that holds no source voxel gets 0, and an integer plane
 * gets the rounded value.
 *
 * A factor can hold a fraction: cell t covers the source
 * `[t * factor, (t + 1) * factor)`, and the source voxels that the two ends cut
 * count with the part of them that lies inside the cell. `frameWeights` does
 * the same for the frames along k.
 *
 * The fill reads the frames by index, one target row at a time. It sums each
 * source column of the rows of the box once, and then sums the columns of each
 * cell. A fill through the composite maps every voxel through world
 * coordinates, which measured 9 ms for a slice of 256 x 256 and about 44
 * seconds for a volume of 512 x 512 x 1232.
 *
 * @param frames - the source planes of the box along k that have arrived
 * @param sourceSize - the width and height of one source plane
 * @param targetSize - the width and height of the reduced plane
 * @param factors - the box size along i and j
 * @param values - the reduced plane that receives the averages
 * @param frameWeights - the weight of each frame, 1 by default
 */
export default function fillPlaneByAverage(
  frames: ArrayLike<number>[],
  [sourceWidth, sourceHeight]: [number, number],
  [width, height]: [number, number],
  [factorI, factorJ]: [number, number],
  values: { [index: number]: number },
  frameWeights?: number[]
): void {
  if (!frames.length) {
    for (let index = 0; index < width * height; index++) {
      values[index] = 0;
    }
    return;
  }

  const columns = spansOfAxis(sourceWidth, width, factorI);
  const rows = spansOfAxis(sourceHeight, height, factorJ);
  const round = !(
    values instanceof Float32Array || values instanceof Float64Array
  );
  const columnSums = new Float64Array(sourceWidth);

  for (let j = 0; j < height; j++) {
    const rowSpan = rows[j];
    let rowWeight = 0;

    columnSums.fill(0);

    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f];
      const frameWeight = frameWeights?.[f] ?? 1;

      for (let row = rowSpan.first; row < rowSpan.end; row++) {
        const weight = frameWeight * weightInSpan(rowSpan, row);
        const start = row * sourceWidth;

        rowWeight += weight;

        for (let i = 0; i < sourceWidth; i++) {
          columnSums[i] += weight * frame[start + i];
        }
      }
    }

    const targetRow = j * width;

    for (let i = 0; i < width; i++) {
      const span = columns[i];
      let sum = 0;
      let columnWeight = 0;

      for (let column = span.first; column < span.end; column++) {
        const weight = weightInSpan(span, column);

        sum += weight * columnSums[column];
        columnWeight += weight;
      }

      const count = columnWeight * rowWeight;
      const value = count ? sum / count : 0;

      values[targetRow + i] = round ? Math.round(value) : value;
    }
  }
}
