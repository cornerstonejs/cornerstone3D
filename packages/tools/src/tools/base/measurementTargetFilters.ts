import type {
  MeasurementTargetCandidate,
  MeasurementTargetOptions,
  MeasurementTargetPredicate,
  MeasurementTargetsFilter,
} from '../../types';

/**
 * Modalities whose display sets do not contain measurable pixel values
 * (segmentations, structured reports etc).  The {@link isPixelData} predicate
 * excludes candidates with one of these modalities.
 */
export const NON_PIXEL_DATA_MODALITIES = [
  'SEG',
  'RTSTRUCT',
  'RTPLAN',
  'SR',
  'PR',
  'KO',
];

/**
 * The default {@link MeasurementTargetPredicate}: keeps a candidate when it
 * carries pixel values.  Segmentation representations (candidates carrying a
 * `representationUID`) and candidates whose modality is one of
 * {@link NON_PIXEL_DATA_MODALITIES} (eg SEG) are excluded - even when they are
 * the only thing shown - while candidates whose display set (and therefore
 * modality) is unknown, such as legacy stacks, are kept.
 */
export const isPixelData: MeasurementTargetPredicate = ({
  modality,
  representationUID,
}) =>
  !representationUID &&
  (!modality || !NON_PIXEL_DATA_MODALITIES.includes(modality));

/**
 * Whether a candidate is an eligible measurement target: it must contain
 * pixel values ({@link isPixelData}) and, when a `targetPredicate` is
 * configured, also satisfy that predicate.  The pixel-data test runs first so
 * segmentations etc are never measured regardless of the predicate.
 */
function isEligible(
  candidate: MeasurementTargetCandidate,
  options: MeasurementTargetOptions
): boolean {
  if (!isPixelData(candidate, options)) {
    return false;
  }
  const { targetPredicate } = options?.configuration ?? {};
  return targetPredicate ? targetPredicate(candidate, options) : true;
}

/**
 * Chooser including just the first eligible pixel-data candidate display set
 * (see {@link isEligible}).  Uses `find` so it stops at the first match
 * instead of building an intermediate array, and returns an empty array when
 * nothing is eligible.
 */
export const firstPixelData: MeasurementTargetsFilter = (
  candidates,
  options
) => {
  const match = candidates.find((candidate) => isEligible(candidate, options));
  return match ? [match] : [];
};

/**
 * Chooser including every eligible pixel-data candidate display set (see
 * {@link isEligible}), for example both the CT and the PT volume on a fusion
 * viewport.  This is the default chooser for the ROI statistics tools.
 */
export const allPixelData: MeasurementTargetsFilter = (candidates, options) =>
  candidates.filter((candidate) => isEligible(candidate, options));

/**
 * Chooser including just the first candidate display set, whether or not it
 * contains pixel values.  Unlike {@link firstPixelData} it ignores the
 * `targetPredicate` - use it as a raw "first target" escape hatch.
 */
export const first: MeasurementTargetsFilter = (candidates) =>
  candidates.length ? [candidates[0]] : [];

/**
 * Chooser including every candidate display set, whether or not it contains
 * pixel values.  Unlike {@link allPixelData} it ignores the `targetPredicate`.
 */
export const all: MeasurementTargetsFilter = (candidates) => candidates;

/**
 * Creates a {@link MeasurementTargetPredicate} keeping the display sets whose
 * modality is one of the given modalities, eg `forModality('PT')` or
 * `forModality('CT', 'PT')`.  Candidates with an unknown display set/modality
 * are excluded.  Configure it as `targetPredicate`; combine with the
 * `firstPixelData`/`allPixelData` chooser to take the first or all matches.
 */
export const forModality =
  (...modalities: string[]): MeasurementTargetPredicate =>
  ({ modality }) =>
    modalities.includes(modality);

/**
 * Creates a {@link MeasurementTargetPredicate} keeping the display sets
 * referencing the given display set, volume or image id.  This is a substring
 * match, so partial identifiers such as a series UID contained in the id may
 * also be used.  Configure it as `targetPredicate`.
 */
export const forId =
  (id: string): MeasurementTargetPredicate =>
  ({ displaySetUID, referencedId, targetId }) =>
    displaySetUID?.includes(id) ||
    referencedId?.includes(id) ||
    targetId.includes(id);

/**
 * Ready made filters for the measurement target selection configuration.  The
 * selection has two composable halves:
 *
 * - `targetsFilter` - a {@link MeasurementTargetsFilter} chooser deciding the
 *   cardinality (first vs all): {@link firstPixelData}, {@link allPixelData}
 *   and the raw {@link first}/{@link all}.
 * - `targetPredicate` - a {@link MeasurementTargetPredicate} deciding whether
 *   an individual candidate is eligible: {@link isPixelData} (the default),
 *   {@link forModality} and {@link forId}.
 *
 * Splitting the decision keeps each half a simple function: the predicate
 * decides one candidate and the chooser decides how many, so the same
 * `forModality('PT')` predicate means "the first PT" under `firstPixelData`
 * and "every PT" under `allPixelData`.
 *
 * The chooser receives the viewport's candidate display sets in viewport
 * order and the {@link MeasurementTargetOptions} (the viewport and the tool
 * configuration), and returns the subset to measure.  A configured chooser's
 * result is authoritative: when it returns no candidates, no statistics are
 * computed or displayed for the viewport.
 *
 * These are plain functions, defined here once rather than per tool, so they
 * can be composed or referenced externally - including from a customization
 * layer that generates the executable predicate with a closure (eg
 * `forModality('PT')`) instead of embedding logic in serialized config.
 *
 * Example configurations:
 * ```ts
 * import { measurementTargetFilters } from '@cornerstonejs/tools';
 *
 * // Every display set containing pixel values (skips SEG etc) - this is the
 * // default for the ROI tools
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.allPixelData,
 * });
 *
 * // CT statistics only - shows nothing on viewports without a CT
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.allPixelData,
 *   targetPredicate: measurementTargetFilters.forModality('CT'),
 * });
 *
 * // Just the first pixel-data display set
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.firstPixelData,
 * });
 *
 * // The first PT display set only
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.firstPixelData,
 *   targetPredicate: measurementTargetFilters.forModality('PT'),
 * });
 * ```
 */
export const measurementTargetFilters = {
  isPixelData,
  firstPixelData,
  allPixelData,
  first,
  all,
  forModality,
  forId,
};

export default measurementTargetFilters;
