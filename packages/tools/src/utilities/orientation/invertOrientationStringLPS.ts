import {
  BIPED_ORIENTATION_LABELS,
  type OrientationLabels,
} from './orientationLabels';

/**
 * Inverts an orientation string by replacing every designator with the one
 * pointing along the opposite patient axis.
 * @public
 *
 * @param orientationString - The orientation.
 * @param labels - Designators per patient axis. Must match the set used to
 *   produce `orientationString`. Defaults to the human (biped) set; pass
 *   {@link QUADRUPED_ORIENTATION_LABELS} for veterinary strings.
 * @returns The inverted orientationString.
 */
export default function invertOrientationStringLPS(
  orientationString: string,
  labels: OrientationLabels = BIPED_ORIENTATION_LABELS
): string {
  // Opposite-direction pairs along each patient axis.
  const oppositePairs: ReadonlyArray<readonly [string, string]> = [
    [labels.positiveX, labels.negativeX],
    [labels.positiveY, labels.negativeY],
    [labels.positiveZ, labels.negativeZ],
  ];

  // Map each designator to its opposite. Longest first so multi-letter
  // veterinary abbreviations (e.g. "CR"/"CD") match before a single letter,
  // as described in DICOM PS3.3 C.7.6.1.1.1 (parseable left-to-right).
  const swaps: Array<[string, string]> = oppositePairs
    .flatMap(([a, b]) => [
      [a, b] as [string, string],
      [b, a] as [string, string],
    ])
    .sort((left, right) => right[0].length - left[0].length);

  let inverted = '';
  for (let i = 0; i < orientationString.length; ) {
    const swap = swaps.find(([from]) => orientationString.startsWith(from, i));
    if (swap) {
      inverted += swap[1];
      i += swap[0].length;
    } else {
      // Preserve any character that is not a known designator (e.g. a delimiter).
      inverted += orientationString[i];
      i += 1;
    }
  }

  return inverted;
}
