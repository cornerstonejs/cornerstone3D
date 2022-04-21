/**
 * Inverts an orientation string.
 * @public
 *
 * @param orientationString - The orientation.
 * @returns The inverted orientationString.
 */
export default function invertOrientationStringLPS(
  orientationString: string
): string {
  let inverted = orientationString.replace('H', 'f');

  inverted = inverted.replace('F', 'h');
  inverted = inverted.replace('R', 'l');
  inverted = inverted.replace('L', 'r');
  inverted = inverted.replace('A', 'p');
  inverted = inverted.replace('P', 'a');
  inverted = inverted.toUpperCase();

  return inverted;
}
