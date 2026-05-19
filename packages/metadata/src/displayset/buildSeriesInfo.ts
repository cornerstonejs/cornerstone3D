import type { NaturalizedInstance, SeriesInfo, SplitRule } from './types';

/**
 * Builds series-level metadata used by split rule selectors.
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
    numImageFrames: numberOfFrames,
    numberOfNonImageObjects,
    numberOfSOPInstanceUIDsPerSeries,
  };

  for (const splitRule of splitRules) {
    splitRule.makeSeriesInfo?.(instances, seriesInfo);
  }

  return seriesInfo;
}
