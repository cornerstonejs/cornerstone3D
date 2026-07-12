import type { MeasurementTargetsFilter } from '../types';

/**
 * The metadata type under which measurement target filters are resolved.
 * The `targetsFilter` tool configuration names a provider `key` and its
 * `options`, and `BaseTool` resolves the actual filter function through the
 * metadata provider chain:
 *
 * ```ts
 * const filter = metaData.getMetaData(
 *   'annotationTargetFilter',
 *   targetsFilter.key,
 *   targetsFilter.options
 * );
 * ```
 *
 * Applications can supply their own target-selection behaviour through their
 * existing metadata providers - register a provider answering this type for
 * new keys (or for the built-in keys, at a priority above
 * {@link ANNOTATION_TARGET_FILTER_PROVIDER_PRIORITY} to override them):
 *
 * ```ts
 * metaData.addProvider((type, key, options) => {
 *   if (type !== 'annotationTargetFilter') {
 *     return;
 *   }
 *   if (key === 'suvCapable') {
 *     return ({ instance }) => instance?.Units === 'BQML';
 *   }
 * });
 * ```
 */
export const ANNOTATION_TARGET_FILTER = 'annotationTargetFilter';

/**
 * The priority the built-in {@link annotationTargetFilterProvider} is
 * registered at - below the default (0), so application providers registered
 * at the default priority take precedence for the built-in keys.
 */
export const ANNOTATION_TARGET_FILTER_PROVIDER_PRIORITY = -10;

/**
 * Modalities whose display sets do not contain measurable pixel values
 * (segmentations, structured reports etc).  The `allPixelData` filter
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
const first: MeasurementTargetsFilter = () => 'useAndStop';

/**
 * Includes every candidate display set, for example both the CT and the PT
 * volume on a fusion viewport.
 */
const all: MeasurementTargetsFilter = () => true;

/**
 * Includes every candidate display set containing pixel values:
 * segmentation representations (candidates carrying a `representationUID`)
 * and candidates whose modality is one of
 * {@link NON_PIXEL_DATA_MODALITIES} (eg SEG) are excluded - even when they
 * are the only thing shown - while candidates whose display set (and
 * therefore modality) is unknown, such as legacy stacks, are included.
 *
 * This is the default filter for the ROI statistics tools, and is what
 * excludes segmentations from the measurement targets (the candidate
 * derivation no longer bakes that exclusion in).
 */
const allPixelData: MeasurementTargetsFilter = ({
  modality,
  representationUID,
}) =>
  !representationUID &&
  (!modality || !NON_PIXEL_DATA_MODALITIES.includes(modality));

/**
 * The built-in `annotationTargetFilter` metadata provider, registered by
 * `init()` at {@link ANNOTATION_TARGET_FILTER_PROVIDER_PRIORITY}.  It answers
 * the {@link ANNOTATION_TARGET_FILTER} type for the built-in keys, returning
 * a {@link MeasurementTargetsFilter} for the `targetsFilter` tool
 * configuration to apply:
 *
 * - `'first'` - just the first candidate display set
 * - `'all'` - every candidate display set
 * - `'allPixelData'` - every display set containing pixel values (the ROI
 *   tools' default); excludes segmentation representations and
 *   {@link NON_PIXEL_DATA_MODALITIES}
 * - `'modality'` - display sets whose modality matches
 *   `options.modality` (a string, eg `'PT'`, or an array, eg
 *   `['CT', 'PT']`); candidates with an unknown display set/modality are
 *   excluded
 * - `'id'` - display sets referencing `options.id` - a substring match
 *   against the display set uid, backing volume/image id and targetId, so
 *   partial identifiers such as a contained series UID also work
 *
 * Unknown keys (and known keys missing their required options) are left for
 * other providers, so applications can extend the vocabulary through the
 * same metadata provider chain.
 */
export function annotationTargetFilterProvider(
  type: string,
  key: string,
  filterOptions?: unknown
): MeasurementTargetsFilter | undefined {
  if (type !== ANNOTATION_TARGET_FILTER) {
    return;
  }
  const options = filterOptions as Record<string, unknown> | undefined;
  switch (key) {
    case 'first':
      return first;
    case 'all':
      return all;
    case 'allPixelData':
      return allPixelData;
    case 'modality': {
      const requested = options?.modality;
      const modalities = Array.isArray(requested)
        ? (requested as string[])
        : typeof requested === 'string'
          ? [requested]
          : undefined;
      if (!modalities?.length) {
        return;
      }
      return ({ modality }) => modalities.includes(modality);
    }
    case 'id': {
      const id = options?.id;
      if (typeof id !== 'string' || !id) {
        return;
      }
      return ({ displaySetUID, referencedId, targetId }) =>
        displaySetUID?.includes(id) ||
        referencedId?.includes(id) ||
        targetId.includes(id);
    }
  }
}
