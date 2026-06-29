import type { NaturalizedInstance, SeriesInfo, SplitRule } from './types';

/**
 * Builds series-level metadata used by split rule selectors.
 *
 * Safe to call with an empty `instances` list: it returns zeroed counts and
 * does not invoke any rule's `updateSeriesInfo` (those may destructure
 * `instances[0]`), so this exported helper - like
 * {@link splitImageIdsBySplitRules} - never throws on empty input.
 *
 * @param instances - naturalized instances for the series.
 * @param splitRules - rules whose `updateSeriesInfo` hooks contribute series-level
 *   flags (skipped entirely when `instances` is empty).
 * @returns the aggregated series info consumed by rule selectors.
 */
export function buildSeriesInfo(
  instances: NaturalizedInstance[],
  splitRules: SplitRule[] = []
): SeriesInfo {
  const NumberOfSeriesRelatedInstances = instances.length;
  let numberOfFrames = 0;
  let numberOfNonImageObjects = 0;
  let numberOfSOPInstanceUIDsPerSeries = 0;

  for (const instance of instances) {
    if (instance.NumberOfFrames) {
      numberOfFrames += Number(instance.NumberOfFrames);
    } else if (instance.Rows) {
      numberOfFrames += 1;
    } else {
      numberOfNonImageObjects += 1;
    }

    if (instance.SOPInstanceUID) {
      numberOfSOPInstanceUIDsPerSeries += 1;
    }
  }

  const seriesInfo: SeriesInfo = {
    NumberOfSeriesRelatedInstances,
    numberOfFrames,
    // `numImageFrames` mirrors `numberOfFrames` here purely for OHIF parity (the
    // display-set shape exposes `numImageFrames`); they intentionally hold the
    // same series-level frame count.
    numImageFrames: numberOfFrames,
    numberOfNonImageObjects,
    numberOfSOPInstanceUIDsPerSeries,
  };

  if (instances.length) {
    for (const splitRule of splitRules) {
      splitRule.updateSeriesInfo?.(instances, seriesInfo);
    }
  }

  return seriesInfo;
}
