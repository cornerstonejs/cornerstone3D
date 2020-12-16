export default function indexWithinDimensions(
  index: Array<number>,
  dimensions: Array<number>
): boolean {
  if (
    index[0] < 0 ||
    index[0] >= dimensions[0] ||
    index[1] < 0 ||
    index[1] >= dimensions[1] ||
    index[2] < 0 ||
    index[2] >= dimensions[2]
  ) {
    return false;
  }

  return true;
}
