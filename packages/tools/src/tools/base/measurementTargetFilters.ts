import type {
  MeasurementTargetsFilter,
  MeasurementTargetCandidate,
} from '../../types';

/**
 * Modalities whose display sets do not contain measurable pixel values
 * (segmentations, structured reports etc).  The {@link allPixelData} filter
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
 * Includes just the first candidate display set, stopping the search there.
 */
export const first: MeasurementTargetsFilter = () => 'useAndStop';

/**
 * Includes every candidate display set, for example both the CT and the PT
 * volume on a fusion viewport.
 */
export const all: MeasurementTargetsFilter = () => true;

/**
 * Includes every candidate display set containing pixel values: segmentation
 * representations (candidates carrying a `representationUID`) and candidates
 * whose modality is one of {@link NON_PIXEL_DATA_MODALITIES} (eg SEG) are
 * excluded - even when they are the only thing shown - while candidates whose
 * display set (and therefore modality) is unknown, such as legacy stacks, are
 * included.
 *
 * This is the default filter for the ROI statistics tools, and is what
 * excludes segmentations from the measurement targets (the candidate
 * derivation no longer bakes that exclusion in).
 */
export const allPixelData: MeasurementTargetsFilter = ({
  modality,
  representationUID,
}) =>
  !representationUID &&
  (!modality || !NON_PIXEL_DATA_MODALITIES.includes(modality));

/**
 * Creates a filter including the display sets whose modality is one of the
 * given modalities, eg `forModality('PT')` or `forModality('CT', 'PT')`.
 * Candidates with an unknown display set/modality are excluded; include them
 * with a custom filter checking `!displaySetInfo.imageIds` if needed.
 */
export const forModality =
  (...modalities: string[]): MeasurementTargetsFilter =>
  ({ modality }) =>
    modalities.includes(modality);

/**
 * Creates a filter including the display sets referencing the given display
 * set, volume or image id.  This is a substring match, so partial identifiers
 * such as a series UID contained in the id may also be used.
 */
export const forId =
  (id: string): MeasurementTargetsFilter =>
  ({ displaySetUID, referencedId, targetId }: MeasurementTargetCandidate) =>
    displaySetUID?.includes(id) ||
    referencedId?.includes(id) ||
    targetId.includes(id);

/**
 * Ready made {@link MeasurementTargetsFilter} implementations for the
 * `targetsFilter` tool configuration option.  The filter decides which of the
 * display sets shown in a viewport a tool computes and displays measurement
 * statistics for - on a fusion viewport this allows showing the statistics of
 * one, several or all of the fused volumes.
 *
 * These are plain functions, defined here once rather than per tool, so they
 * can be composed or referenced externally - including from a customization
 * layer that generates the executable filter with a closure (eg
 * `forModality('PT')`) instead of embedding logic in serialized config.
 *
 * The filter is called once per candidate display set, in viewport order,
 * receiving the display set related parameters (display set, uid, exemplar
 * instance, index and the previously chosen candidate) and the viewport.  It
 * returns, per candidate:
 * - `true` to include the display set and continue
 * - `false`/`undefined` to skip it and continue
 * - `'useAndStop'` to include it and stop looking for further items
 * - `'stop'` to skip it and stop looking for further items
 *
 * The decision should be based on the modality of the display set where
 * available.  When the display set is unknown (eg a stack viewport using the
 * legacy set image ids), the candidate has no display set fields and no
 * modality, and a filter can choose whether to include it based on that.
 *
 * A configured filter's result is authoritative: when it includes no
 * candidates, no statistics are computed or displayed for the viewport.
 *
 * Example configurations:
 * ```ts
 * import { measurementTargetFilters } from '@cornerstonejs/tools';
 *
 * // CT statistics only - shows nothing on viewports without a CT
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.forModality('CT'),
 * });
 *
 * // PT statistics only - shows nothing on viewports without a PT
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.forModality('PT'),
 * });
 *
 * // Every display set containing pixel values (skips SEG etc) - this is the
 * // default for the ROI tools
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.allPixelData,
 * });
 *
 * // Just the first display set
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: measurementTargetFilters.first,
 * });
 *
 * // Custom: the first PT display set only, stopping the search once found
 * toolGroup.addTool(CircleROITool.toolName, {
 *   targetsFilter: (displaySetInfo) =>
 *     displaySetInfo.modality === 'PT' ? 'useAndStop' : false,
 * });
 * ```
 */
export const measurementTargetFilters = {
  first,
  all,
  allPixelData,
  forModality,
  forId,
};

export default measurementTargetFilters;
