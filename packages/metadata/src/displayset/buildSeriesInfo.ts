import type { NaturalizedInstance, SeriesInfo } from './types';

/**
 * Aggregates series-level statistics over a series' naturalized instances.
 *
 * Independent of split rules: a rule derives its own facts through its `series`
 * hook (see {@link RuleContext}), so this helper only counts and is safe to call
 * with an empty `instances` list (it returns zeroed counts).
 *
 * @param instances - naturalized instances for the series.
 * @returns the aggregated series statistics.
 */
export function buildSeriesInfo(instances: NaturalizedInstance[]): SeriesInfo {
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

  return {
    NumberOfSeriesRelatedInstances,
    numberOfFrames,
    // `numImageFrames` mirrors `numberOfFrames` here purely for OHIF parity (the
    // display-set shape exposes `numImageFrames`); they intentionally hold the
    // same series-level frame count.
    numImageFrames: numberOfFrames,
    numberOfNonImageObjects,
    numberOfSOPInstanceUIDsPerSeries,
  };
}
