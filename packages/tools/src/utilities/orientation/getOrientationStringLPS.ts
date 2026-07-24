import type { Types } from '@cornerstonejs/core';
import {
  BIPED_ORIENTATION_LABELS,
  type OrientationLabels,
} from './orientationLabels';

/**
 * Returns the orientation of the vector in the patient coordinate system.
 * @public
 *
 * @param vector - Input array
 * @param labels - Designators to use for each patient axis. Defaults to the
 *   human (biped) set; pass {@link QUADRUPED_TRUNK_ORIENTATION_LABELS} or
 *   {@link QUADRUPED_HEAD_ORIENTATION_LABELS} for veterinary imaging, per
 *   DICOM PS3.3 C.7.6.1.1.1 (quadruped designators are body-region-specific).
 * @returns The orientation in the patient coordinate system.
 */
export default function getOrientationStringLPS(
  vector: Types.Point3,
  labels: OrientationLabels = BIPED_ORIENTATION_LABELS
): string {
  // Thanks to David Clunie
  // https://sites.google.com/site/dicomnotes/

  let orientation = '';
  const orientationX = vector[0] < 0 ? labels.negativeX : labels.positiveX;
  const orientationY = vector[1] < 0 ? labels.negativeY : labels.positiveY;
  const orientationZ = vector[2] < 0 ? labels.negativeZ : labels.positiveZ;

  // Should probably make this a function vector3.abs
  const abs = [Math.abs(vector[0]), Math.abs(vector[1]), Math.abs(vector[2])];

  const MIN = 0.0001;

  for (let i = 0; i < 3; i++) {
    if (abs[0] > MIN && abs[0] > abs[1] && abs[0] > abs[2]) {
      orientation += orientationX;
      abs[0] = 0;
    } else if (abs[1] > MIN && abs[1] > abs[0] && abs[1] > abs[2]) {
      orientation += orientationY;
      abs[1] = 0;
    } else if (abs[2] > MIN && abs[2] > abs[0] && abs[2] > abs[1]) {
      orientation += orientationZ;
      abs[2] = 0;
    } else if (abs[0] > MIN && abs[1] > MIN && abs[0] === abs[1]) {
      orientation += orientationX + orientationY;
      abs[0] = 0;
      abs[1] = 0;
    } else if (abs[0] > MIN && abs[2] > MIN && abs[0] === abs[2]) {
      orientation += orientationX + orientationZ;
      abs[0] = 0;
      abs[2] = 0;
    } else if (abs[1] > MIN && abs[2] > MIN && abs[1] === abs[2]) {
      orientation += orientationY + orientationZ;
      abs[1] = 0;
      abs[2] = 0;
    } else {
      break;
    }
  }

  return orientation;
}
