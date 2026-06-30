import type {
  InstanceGroup,
  NaturalizedInstance,
  RuleContext,
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
  context: RuleContext,
  splitRule: SplitRule,
  ruleDiscriminator: string | number
): string {
  const groupBy = splitRule.groupBy ?? ['SeriesInstanceUID'];
  const parts = groupBy.map((key) =>
    typeof key === 'function' ? key(instance, context) : instance[key]
  );
  return JSON.stringify([ruleDiscriminator, ...parts]);
}

/**
 * Groups instances into instance groups using the first matching split rule per
 * instance (rules are evaluated in order; first match wins).
 *
 * Each rule's optional `series` hook runs **once** here (per rule, per call) to
 * derive that rule's series-level facts; those facts are passed to the rule's
 * `matches` and `groupBy` via the {@link RuleContext}. A rule only ever sees its
 * own derived facts.
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
  onUnmatched?: (instance: NaturalizedInstance) => void
): InstanceGroup[] {
  if (!instances.length) {
    return [];
  }

  // Derive each rule's series-level facts once for this split operation, so the
  // per-instance `matches`/`groupBy` only read an already-computed value.
  const ruleContexts: RuleContext[] = splitRules.map((rule) => ({
    series: rule.series?.({ instances }) ?? {},
  }));

  const instancesMap = new Map<string, InstanceGroup>();

  for (const instance of instances) {
    let matched = false;

    for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
      const splitRule = splitRules[ruleIndex];
      const context = ruleContexts[ruleIndex];
      if (splitRule.matches && !splitRule.matches(instance, context)) {
        continue;
      }

      matched = true;
      const key = buildSplitKey(
        instance,
        context,
        splitRule,
        // Always include ruleIndex so two rules that reuse the same `id` can
        // never collide into one bucket (and inherit the wrong matchedRule).
        `${ruleIndex}:${splitRule.id ?? ''}`
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
