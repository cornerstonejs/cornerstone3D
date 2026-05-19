import { buildSeriesInfo } from './buildSeriesInfo';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { resolveInstances } from './resolveInstances';
import type { GroupedInstanceBucket, SplitContext, SplitRule } from './types';

export type SplitSeriesInstanceGroupsOptions = SplitContext & {
  splitRules: SplitRule[];
  onMissingImageId?: (imageId: string) => void;
};

/**
 * Primary entrypoint: splits a series represented by metadata imageIds into instance groups.
 */
export function splitSeriesInstanceGroupsFromImageIds(
  imageIds: string[],
  options: SplitSeriesInstanceGroupsOptions
): GroupedInstanceBucket[] {
  const { getNaturalizedInstance, splitRules, onMissingImageId } = options;

  const instances = resolveInstances(imageIds, getNaturalizedInstance, {
    onMissing: onMissingImageId,
  });

  if (!instances.length) {
    return [];
  }

  const seriesInfo = buildSeriesInfo(instances, splitRules);
  return groupInstancesBySplitRules(instances, splitRules, seriesInfo);
}
