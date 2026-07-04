/**
 * Orientation label designators for the patient-based coordinate system (LPS),
 * as defined in DICOM PS3.3 Section C.7.6.1.1.1 (Patient Orientation).
 *
 * The geometric axes are identical for every species; only the anatomical
 * designator letters differ. The `AnatomicalOrientationType` (0010,2210)
 * attribute selects which set applies: `BIPED` (human, the default when
 * absent) or `QUADRUPED` (veterinary).
 *
 * @public
 */
export type OrientationLabels = {
  /** Designator for the +X axis (toward the patient's left side). */
  positiveX: string;
  /** Designator for the -X axis (toward the patient's right side). */
  negativeX: string;
  /** Designator for the +Y axis (posterior / dorsal side). */
  positiveY: string;
  /** Designator for the -Y axis (anterior / ventral side). */
  negativeY: string;
  /** Designator for the +Z axis (toward the head / cranial direction). */
  positiveZ: string;
  /** Designator for the -Z axis (toward the feet / caudal direction). */
  negativeZ: string;
};

/**
 * Human (biped) orientation designators. Used when `AnatomicalOrientationType`
 * (0010,2210) is absent or has the value `BIPED`. This is the historical
 * default and keeps existing behavior unchanged.
 *
 * @public
 */
export const BIPED_ORIENTATION_LABELS: OrientationLabels = {
  positiveX: 'L', // Left
  negativeX: 'R', // Right
  positiveY: 'P', // Posterior
  negativeY: 'A', // Anterior
  positiveZ: 'H', // Head
  negativeZ: 'F', // Foot
};

/**
 * Veterinary (quadruped) orientation designators. Used when
 * `AnatomicalOrientationType` (0010,2210) has the value `QUADRUPED`
 * (e.g. dogs, cats, horses). As noted in DICOM PS3.3 C.7.6.1.1.1 the
 * abbreviations are multi-letter because single letters are reserved for
 * other veterinary directions (R = Rostral, L = Lateral).
 *
 * Geometric mapping is unchanged from the LPS frame:
 * - +X/-X = Left/Right
 * - +Y/-Y = Dorsal/Ventral (replaces human Posterior/Anterior)
 * - +Z/-Z = Cranial/Caudal (replaces human Head/Foot)
 *
 * @public
 */
export const QUADRUPED_ORIENTATION_LABELS: OrientationLabels = {
  positiveX: 'LE', // Left
  negativeX: 'RT', // Right
  positiveY: 'D', // Dorsal
  negativeY: 'V', // Ventral
  positiveZ: 'CR', // Cranial
  negativeZ: 'CD', // Caudal
};
