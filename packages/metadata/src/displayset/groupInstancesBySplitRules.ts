import type {
  InstanceGroup,
  NaturalizedInstance,
  RuleContext,
  SplitRule,
} from './types';

/**
 * Canonical acquisition order for a rule's instances, used to compute runs
 * (see {@link SplitRule.runBy}).
 *
 * Deliberately *not* the caller's input order: a run index derived from input
 * order would make bucket keys depend on the order imageIds happened to be
 * passed in, which is exactly the property this module guarantees against.
 * `InstanceNumber` is the acquisition sequence; `SOPInstanceUID` breaks ties so
 * the order is total even when instance numbers are absent or duplicated.
 */
function compareInstances(
  a: NaturalizedInstance,
  b: NaturalizedInstance
): number {
  const aNumber = Number(a.InstanceNumber);
  const bNumber = Number(b.InstanceNumber);
  const aHas = Number.isFinite(aNumber);
  const bHas = Number.isFinite(bNumber);

  if (aHas && bHas && aNumber !== bNumber) {
    return aNumber - bNumber;
  }
  // Instances without a usable InstanceNumber sort after those with one, rather
  // than aliasing to 0 and interleaving with the numbered ones.
  if (aHas !== bHas) {
    return aHas ? -1 : 1;
  }

  const aUid = String(a.SOPInstanceUID ?? a.imageId ?? '');
  const bUid = String(b.SOPInstanceUID ?? b.imageId ?? '');
  return aUid < bUid ? -1 : aUid > bUid ? 1 : 0;
}

/**
 * Assigns each instance the ordinal of the run it belongs to.
 *
 * Walks `instances` in canonical order and increments the ordinal every time
 * `runBy` returns a value differing from the previous instance's - so a series
 * of `single single single clip single clip` yields runs `0 0 0 1 2 3`.
 *
 * Keyed by object identity rather than by UID: the caller passes the very same
 * instance objects to `groupInstancesBySplitRules`, and object identity avoids
 * assuming every instance carries a `SOPInstanceUID`.
 */
function buildRunIndex(
  instances: NaturalizedInstance[],
  runBy: NonNullable<SplitRule['runBy']>,
  context: RuleContext
): Map<NaturalizedInstance, number> {
  const ordered = [...instances].sort(compareInstances);
  const runIndex = new Map<NaturalizedInstance, number>();

  let currentRun = -1;
  let previousValue: unknown;
  let hasPrevious = false;

  for (const instance of ordered) {
    const value = runBy(instance, context);
    // Compare serialized so structurally-equal object/array values (e.g. an
    // ImageType array) do not start a spurious new run through reference
    // inequality. `Object.is` would treat every fresh array as a change.
    if (!hasPrevious || !isSameRunValue(previousValue, value)) {
      currentRun += 1;
    }
    runIndex.set(instance, currentRun);
    previousValue = value;
    hasPrevious = true;
  }

  return runIndex;
}

function isSameRunValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Builds the bucket key an instance is grouped under for a given rule.
 *
 * The key is **namespaced by the rule** (via `ruleDiscriminator`) so two
 * different rules can never share a bucket even if their split values coincide,
 * and it is **JSON-encoded** so the parts can't collide through a separator -
 * e.g. an `&` inside a tag value, or `undefined` vs `''` vs a missing tag, which
 * a plain string join would alias together.
 *
 * The discriminator is the rule's `id`, NOT its position in the rule set:
 * position would make every key below an inserted rule change, silently
 * invalidating any identity derived from the split. See
 * {@link resolveRuleDiscriminators}.
 */
function buildSplitKey(
  instance: NaturalizedInstance,
  context: RuleContext,
  splitRule: SplitRule,
  ruleDiscriminator: string,
  runIndex: Map<NaturalizedInstance, number> | undefined
): string {
  const groupBy = splitRule.groupBy ?? ['SeriesInstanceUID'];
  const parts = groupBy.map((key) =>
    typeof key === 'function' ? key(instance, context) : instance[key]
  );
  if (runIndex) {
    parts.push(runIndex.get(instance));
  }
  return JSON.stringify([ruleDiscriminator, ...parts]);
}

/**
 * Resolves the namespace each rule contributes to its bucket keys, and rejects
 * a rule set that cannot produce stable ones.
 *
 * A rule's `id` is its identity: keying off it means inserting, removing or
 * reordering rules leaves every other rule's keys untouched, which is what lets
 * a caller persist something against a display set and still find it after the
 * rule set is edited. Duplicate ids would collapse two rules into one bucket
 * namespace, so they are a hard error rather than something to paper over.
 *
 * A rule with no id has no identity to key off, so it falls back to its
 * position - documented on {@link SplitRule.id} as the unstable case.
 */
function resolveRuleDiscriminators(splitRules: SplitRule[]): string[] {
  const seen = new Set<string>();

  return splitRules.map((rule, ruleIndex) => {
    if (rule.id === undefined) {
      return `#${ruleIndex}`;
    }
    if (seen.has(rule.id)) {
      throw new Error(
        `Duplicate split rule id "${rule.id}" at index ${ruleIndex}. Split rule ids namespace the bucket keys display set identities are derived from, so they must be unique within a rule set.`
      );
    }
    seen.add(rule.id);
    return rule.id;
  });
}

/**
 * Groups instances into instance groups using the first matching split rule per
 * instance (rules are evaluated in order; first match wins).
 *
 * Each rule's optional `series` hook runs **once** here (per rule, per call) to
 * derive that rule's series-level facts; those facts are passed to the rule's
 * `matches`, `groupBy` and `runBy` via the {@link RuleContext}. A rule only ever
 * sees its own derived facts.
 *
 * A rule declaring {@link SplitRule.runBy} additionally has its claimed
 * instances walked in acquisition order to number the runs they form, so
 * interleaved kinds (an ultrasound series alternating single images and clips)
 * separate rather than merging into one bucket.
 *
 * Groups are returned in a **deterministic order** - by the position of the rule
 * that produced them, then by bucket key - so a series' display sets are stable
 * regardless of the order the imageIds were passed in. The key comparison is
 * numeric-aware, so a group keyed on instance 10 sorts after instance 2 rather
 * than lexically before it.
 *
 * @param onUnmatched - called for each instance that matches no rule and is
 *   therefore placed in no group (e.g. a non-image SOP such as an SR or
 *   presentation state). Lets callers observe what was dropped instead of it
 *   disappearing silently.
 * @throws if two rules in `splitRules` share an `id`.
 */
export function groupInstancesBySplitRules(
  instances: NaturalizedInstance[],
  splitRules: SplitRule[],
  onUnmatched?: (instance: NaturalizedInstance) => void
): InstanceGroup[] {
  if (!instances.length) {
    return [];
  }

  const ruleDiscriminators = resolveRuleDiscriminators(splitRules);

  // Derive each rule's series-level facts once for this split operation, so the
  // per-instance `matches`/`groupBy`/`runBy` only read an already-computed value.
  const ruleContexts: RuleContext[] = splitRules.map((rule) => ({
    series: rule.series?.({ instances }) ?? {},
  }));

  // Claim instances first, so a rule's runs are computed over the instances it
  // actually owns - an instance claimed by an earlier rule neither joins nor
  // interrupts a later rule's runs.
  const claimedByRule: NaturalizedInstance[][] = splitRules.map(() => []);

  for (const instance of instances) {
    let matched = false;

    for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
      const splitRule = splitRules[ruleIndex];
      const context = ruleContexts[ruleIndex];
      if (splitRule.matches && !splitRule.matches(instance, context)) {
        continue;
      }
      claimedByRule[ruleIndex].push(instance);
      matched = true;
      break;
    }

    if (!matched) {
      onUnmatched?.(instance);
    }
  }

  const runIndexes = splitRules.map((rule, ruleIndex) =>
    rule.runBy
      ? buildRunIndex(
          claimedByRule[ruleIndex],
          rule.runBy,
          ruleContexts[ruleIndex]
        )
      : undefined
  );

  const instancesMap = new Map<string, InstanceGroup>();
  // Preserves rule order in the output without leaking the rule's position into
  // the key itself, which is the whole point of the id-based discriminator.
  const groupRuleIndex = new Map<string, number>();

  for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
    const splitRule = splitRules[ruleIndex];
    const context = ruleContexts[ruleIndex];

    for (const instance of claimedByRule[ruleIndex]) {
      const key = buildSplitKey(
        instance,
        context,
        splitRule,
        ruleDiscriminators[ruleIndex],
        runIndexes[ruleIndex]
      );

      let group = instancesMap.get(key);
      if (!group) {
        group = { instances: [], matchedRule: splitRule, splitKey: key };
        instancesMap.set(key, group);
        groupRuleIndex.set(key, ruleIndex);
      }
      group.instances.push(instance);
    }
  }

  return Array.from(instancesMap.values()).sort((a, b) => {
    const ruleOrder =
      (groupRuleIndex.get(a.splitKey ?? '') ?? 0) -
      (groupRuleIndex.get(b.splitKey ?? '') ?? 0);
    if (ruleOrder !== 0) {
      return ruleOrder;
    }
    return (a.splitKey ?? '').localeCompare(b.splitKey ?? '', undefined, {
      numeric: true,
    });
  });
}
