import { buildSeriesInfo } from './buildSeriesInfo';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { resolveInstances } from './resolveInstances';
import type { InstanceGroup, SplitContext, SplitRule } from './types';

export type SplitImageIdsBySplitRulesOptions = SplitContext & {
  splitRules: SplitRule[];
  onMissingImageId?: (imageId: string) => void;
};

/**
 * Primary entrypoint: splits a series represented by metadata imageIds into instance groups.
 */
export function splitImageIdsBySplitRules(
  imageIds: string[],
  options: SplitImageIdsBySplitRulesOptions
): InstanceGroup[] {
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
