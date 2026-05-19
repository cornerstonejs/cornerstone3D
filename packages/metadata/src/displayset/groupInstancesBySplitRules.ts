import type {
  GroupedInstanceBucket,
  NaturalizedInstance,
  SeriesInfo,
  SplitRule,
} from './types';

function buildSplitKey(
  instance: NaturalizedInstance,
  seriesInfo: SeriesInfo,
  splitRule: SplitRule
): string {
  const splitKey = splitRule.splitKey ?? ['SeriesInstanceUID'];
  return splitKey
    .map((key) =>
      typeof key === 'function' ? key(instance, seriesInfo) : instance[key]
    )
    .join('&');
}

/**
 * Groups instances into buckets using the first matching split rule per instance.
 */
export function groupInstancesBySplitRules(
  instances: NaturalizedInstance[],
  splitRules: SplitRule[],
  seriesInfo: SeriesInfo
): GroupedInstanceBucket[] {
  const instancesMap = new Map<
    string,
    { instances: NaturalizedInstance[]; matchedRule: SplitRule }
  >();

  for (const instance of instances) {
    let addedToDisplaySet = false;

    for (const splitRule of splitRules) {
      if (
        !addedToDisplaySet &&
        (!splitRule.ruleSelector ||
          splitRule.ruleSelector(instance, seriesInfo))
      ) {
        addedToDisplaySet = true;
        const key = buildSplitKey(instance, seriesInfo, splitRule);

        if (!instancesMap.has(key)) {
          instancesMap.set(key, { instances: [], matchedRule: splitRule });
        }

        instancesMap.get(key)!.instances.push(instance);
      }
    }
  }

  return Array.from(instancesMap.values());
}
