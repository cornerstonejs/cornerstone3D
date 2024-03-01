/**
 * Return the decimated indices for the given list.
 * @param list - to decimate the indices for
 * @param interleave - the interleave interval for decimation
 * @param offset - where to start the interleave from
 */
export default function decimate(
  list: Array<unknown>,
  interleave: number,
  offset = 0
): number[] {
  const interleaveIndices = [];
  for (let i = offset; i < list.length; i += interleave) {
    interleaveIndices.push(i);
  }
  return interleaveIndices;
}
