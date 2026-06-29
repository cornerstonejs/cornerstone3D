import type {
  InstanceGroup,
  NaturalizedInstance,
  SeriesInfo,
  SplitRule,
} from './types';

/**
 * Builds the bucket key an instance is grouped under for a given rule.
 *
 * The key is **namespaced by the rule** (via `ruleDiscriminator`) so two
 * different rules can never share a bucket even if their split values coincide,
 * and it is **JSON-encoded** so the parts can't collide through a separator -
 * e.g. an `&` inside a tag value, or `undefined` vs `''` vs a missing tag, which
 * a plain string join would alias together.
 */
function buildSplitKey(
  instance: NaturalizedInstance,
  seriesInfo: SeriesInfo,
  splitRule: SplitRule,
  ruleDiscriminator: string | number
): string {
  const splitKey = splitRule.splitKey ?? ['SeriesInstanceUID'];
  const parts = splitKey.map((key) =>
    typeof key === 'function' ? key(instance, seriesInfo) : instance[key]
  );
  return JSON.stringify([ruleDiscriminator, ...parts]);
}

/**
 * Groups instances into instance groups using the first matching split rule per
 * instance (rules are evaluated in order; first match wins).
 *
 * Groups are returned in a **deterministic order** (sorted by their bucket key),
 * so a series' display sets - and any identity derived from their position -
 * are stable regardless of the order the imageIds were passed in.
 *
 * @param onUnmatched - called for each instance that matches no rule and is
 *   therefore placed in no group (e.g. a non-image SOP such as an SR or
 *   presentation state). Lets callers observe what was dropped instead of it
 *   disappearing silently.
 */
export function groupInstancesBySplitRules(
  instances: NaturalizedInstance[],
  splitRules: SplitRule[],
  seriesInfo: SeriesInfo,
  onUnmatched?: (instance: NaturalizedInstance) => void
): InstanceGroup[] {
  const instancesMap = new Map<string, InstanceGroup>();

  for (const instance of instances) {
    let matched = false;

    for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
      const splitRule = splitRules[ruleIndex];
      if (
        splitRule.ruleSelector &&
        !splitRule.ruleSelector(instance, seriesInfo)
      ) {
        continue;
      }

      matched = true;
      const key = buildSplitKey(
        instance,
        seriesInfo,
        splitRule,
        splitRule.id ?? ruleIndex
      );

      let group = instancesMap.get(key);
      if (!group) {
        group = { instances: [], matchedRule: splitRule, splitKey: key };
        instancesMap.set(key, group);
      }
      group.instances.push(instance);
      break;
    }

    if (!matched) {
      onUnmatched?.(instance);
    }
  }

  return Array.from(instancesMap.values()).sort((a, b) =>
    (a.splitKey ?? '').localeCompare(b.splitKey ?? '')
  );
}
