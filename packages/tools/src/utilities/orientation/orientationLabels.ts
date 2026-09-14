/**
 * Orientation label designators for the patient-based coordinate system (LPS),
 * as defined in DICOM PS3.3 Section C.7.6.1.1.1 (Patient Orientation).
 *
 * The geometric axes are identical for every species; only the anatomical
 * designator letters differ. The `AnatomicalOrientationType` (0010,2210)
 * attribute selects which set applies:
 *
 * - `BIPED` (human, the default when absent) — a single universal mapping,
 *   see {@link BIPED_ORIENTATION_LABELS}.
 * - `QUADRUPED` (veterinary) — **body-region-specific**. DICOM lists many
 *   quadruped designators (rostral, proximal, distal, palmar, plantar, ...)
 *   precisely because no single mapping covers every study:
 *   - **trunk, neck, tail** → cranial/caudal on the Z axis
 *     ({@link QUADRUPED_TRUNK_ORIENTATION_LABELS})
 *   - **head** → rostral/caudal on the Z axis
 *     ({@link QUADRUPED_HEAD_ORIENTATION_LABELS})
 *   - **limbs** → proximal/distal along the limb; the designators depend on
 *     limb positioning, so there is no fixed-axis preset. Callers must build
 *     a region-appropriate {@link OrientationLabels} from the DICOM designators
 *     (PR/DI proximal-distal, PA palmar, PL plantar, ...) for each study.
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
 * (0010,2210) is absent or has the value `BIPED`. The biped mapping is
 * universal, so this is the historical default and keeps existing behavior
 * unchanged.
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
 * Veterinary (quadruped) designators for the **trunk, neck and tail** — the
 * standard whole-body cranial-caudal frame. This is the mapping used in the
 * worked example of DICOM PS3.3 C.7.6.1.1.1 (a quadruped abdomen view encoded
 * "LEV\\CD"), and cranial/caudal apply to the neck, trunk and tail per
 * veterinary anatomy.
 *
 * - +X/-X = Left/Right (LE/RT)
 * - +Y/-Y = Dorsal/Ventral (D/V)
 * - +Z/-Z = Cranial/Caudal (CR/CD)
 *
 * Do not use this preset for the head or limbs — see
 * {@link QUADRUPED_HEAD_ORIENTATION_LABELS} and the limb note above.
 *
 * @public
 */
export const QUADRUPED_TRUNK_ORIENTATION_LABELS: OrientationLabels = {
  positiveX: 'LE', // Left
  negativeX: 'RT', // Right
  positiveY: 'D', // Dorsal
  negativeY: 'V', // Ventral
  positiveZ: 'CR', // Cranial
  negativeZ: 'CD', // Caudal
};

/**
 * Veterinary (quadruped) designators for the **head**. Identical to the trunk
 * frame except the +Z/-Z axis is rostral/caudal (R/CD): "rostral" points
 * toward the nose and is used only for the head, while cranial/caudal apply to
 * the neck, trunk and tail (per veterinary anatomy). Dorsal/ventral and
 * left/right still apply to the head.
 *
 * - +X/-X = Left/Right (LE/RT)
 * - +Y/-Y = Dorsal/Ventral (D/V)
 * - +Z/-Z = Rostral/Caudal (R/CD)
 *
 * @public
 */
export const QUADRUPED_HEAD_ORIENTATION_LABELS: OrientationLabels = {
  positiveX: 'LE', // Left
  negativeX: 'RT', // Right
  positiveY: 'D', // Dorsal
  negativeY: 'V', // Ventral
  positiveZ: 'R', // Rostral
  negativeZ: 'CD', // Caudal
};
