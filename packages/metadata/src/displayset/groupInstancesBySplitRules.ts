import type {
  GroupInstancesOptions,
  InstanceGroup,
  InstanceOrderContext,
  NaturalizedInstance,
  OrderInstancesOptions,
  RuleContext,
  SeriesFacts,
  SplitRule,
  SplitRuleSet,
} from './types';
import { resolveSplitRuleSet } from './splitRuleSet';
import { withInstances } from './displaySetContext';
import { isUnsafeKey, toFinite } from '../safeFunctions';

/**
 * Builds the series context of one split: runs the `series` hook of each rule,
 * in the order given (priority order), and merges what it returns.
 *
 * The first rule that computes a name wins. A later hook gets the facts so far
 * as `context.series`, and a name it returns that is already present is
 * ignored, so two rules can each declare the fact they read and the fact is
 * computed once. A rule that is turned off (`priority: null`) is not in
 * `rules`, so it computes nothing.
 *
 * Exported so that a host which re-sorts a display set outside a split
 * computes the context the same way (see {@link orderInstancesForRule}).
 */
export function computeSeriesFacts(
  instances: NaturalizedInstance[],
  rules: readonly SplitRule[]
): SeriesFacts {
  const facts: SeriesFacts = {};
  for (const rule of rules) {
    if (!rule.series) {
      continue;
    }
    const computed = rule.series({ instances, series: facts }) ?? {};
    for (const [name, value] of Object.entries(computed)) {
      if (
        !isUnsafeKey(name) &&
        !Object.prototype.hasOwnProperty.call(facts, name)
      ) {
        facts[name] = value;
      }
    }
  }
  return facts;
}

type Comparator = NonNullable<SplitRule['compareInstances']>;

/**
 * Chains comparators: the first one that gives a finite non-zero value
 * decides. A result of 0 or `NaN` is "no opinion", and the next comparator
 * decides.
 */
export function chainComparators(comparators: Comparator[]): Comparator {
  if (comparators.length === 1) {
    return comparators[0];
  }
  return (a, b, context) => {
    for (const comparator of comparators) {
      const order = comparator(a, b, context);
      if (Number.isFinite(order) && order !== 0) {
        return order;
      }
    }
    return 0;
  };
}

/**
 * Canonical acquisition order, and the default a rule gets when it declares no
 * {@link SplitRule.compareInstances}.
 *
 * Deliberately *not* the caller's input order: an order derived from input order
 * would make the order of a display set depend on the order imageIds happened
 * to be passed in, which is exactly the property this module guarantees against.
 * `InstanceNumber` is the acquisition sequence; `SOPInstanceUID` breaks ties so
 * the order is total even when instance numbers are absent or duplicated.
 */
function compareByAcquisition(
  a: NaturalizedInstance,
  b: NaturalizedInstance
): number {
  // `toFinite`, not `Number`: an absent InstanceNumber must not alias to 0.
  const aNumber = toFinite(a.InstanceNumber);
  const bNumber = toFinite(b.InstanceNumber);
  const aHas = aNumber !== undefined;
  const bHas = bNumber !== undefined;

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
 * The order each group's `instances` are returned in.
 *
 * Three layers, each deferring to the one below it:
 *
 *  1. **Acquisition order**, always applied first. Not the caller's input order:
 *     an order derived from that would make the order of a display set depend
 *     on the sequence imageIds happened to arrive in, which is the property
 *     this module exists to guarantee against. Everything below is
 *     applied to this canonical order, so it is also the final tie-break.
 *  2. **The host's base sort** ({@link GroupInstancesOptions.sortInstances}), a
 *     whole-list sort rather than a comparator. It has to be: a real base order
 *     is not always pairwise - ordering slices along the scan axis means picking
 *     a reference instance and projecting onto its normal, which no `(a, b)`
 *     function can express. Ties it leaves alone keep the order from step 1,
 *     because `Array.prototype.sort` is stable.
 *  3. **Comparators**, the rule's own {@link SplitRule.compareInstances} first,
 *     then the host's default ({@link GroupInstancesOptions.compareInstances}).
 *     The first one to return a finite non-zero value decides. **A comparator
 *     returning 0 is declining to have an opinion**, not asserting equality: the
 *     next comparator is consulted, and if none has an opinion the base order
 *     from steps 1-2 stands. So a comparator can express "order by this one
 *     thing, and leave the rest alone" without having to restate the default.
 *
 * A `NaN` counts as no opinion too - arithmetic on a tag one instance is missing
 * produces one, and treating it as 0 would otherwise hand ordering to whatever
 * `sort` does with a non-numeric result.
 */
function buildInstanceOrderer(
  splitRule: SplitRule,
  context: RuleContext,
  options: GroupInstancesOptions
): (instances: NaturalizedInstance[]) => NaturalizedInstance[] {
  const comparators = [
    splitRule.compareInstances,
    options.compareInstances,
  ].filter(
    (comparator): comparator is NonNullable<SplitRule['compareInstances']> =>
      typeof comparator === 'function'
  );
  const baseSort = options.sortInstances;
  const orderContext: InstanceOrderContext = {
    matchedRule: splitRule,
    series: context.series,
  };

  return (instances) => {
    let ordered = [...instances].sort(compareByAcquisition);

    if (baseSort) {
      // Copied because a host sort may return the array it was handed, and the
      // comparator pass below sorts in place.
      ordered = [...baseSort(ordered, orderContext)];
    }

    if (comparators.length) {
      const compare = chainComparators(comparators);
      ordered.sort((a, b) => compare(a, b, context));
    }

    return ordered;
  };
}

/**
 * The order one rule puts a set of instances in, for a host that has to reproduce
 * it outside a split - re-sorting a display set after new instances arrive, say.
 *
 * Exported so that ordering has exactly one implementation: a host applying its
 * own sort a second time would discard the rule's comparator, which is precisely
 * the bug this replaces.
 *
 * Pass the group's {@link InstanceGroup.series} as `options.series`, so the
 * comparators see the facts the split computed from the whole series. Without
 * it, the facts are computed from `instances` alone, by this rule's own
 * `series` hook only, so a fact that an earlier rule computed is missing.
 *
 * When `instances` holds an instance that the split did not see (the series
 * got new instances), the values of the display set context are computed
 * again over the instances of the split and the new instances, so a
 * `sortBy` name such as `sliceDistance` is correct for the new instances too.
 */
export function orderInstancesForRule(
  instances: NaturalizedInstance[],
  splitRule: SplitRule,
  options: OrderInstancesOptions = {}
): NaturalizedInstance[] {
  const context: RuleContext = {
    series: options.series
      ? withInstances(options.series, instances)
      : computeSeriesFacts(instances, [splitRule]),
  };
  return buildInstanceOrderer(splitRule, context, options)(instances);
}

function isDigitAt(value: string, index: number): boolean {
  const code = value.charCodeAt(index);
  return code >= 0x30 && code <= 0x39;
}

function digitRunEnd(value: string, start: number): number {
  let end = start;
  while (end < value.length && isDigitAt(value, end)) {
    end += 1;
  }
  return end;
}

/**
 * Orders two runs of digits by value, then by zero padding.
 *
 * Falling back to padding once the values tie is what keeps
 * {@link compareSplitKeys} a *total* order: `"01"` and `"1"` are different keys
 * and must not compare equal.
 */
function compareDigitRuns(a: string, b: string): number {
  const aValue = a.replace(/^0+/, '');
  const bValue = b.replace(/^0+/, '');

  // Same digit count, so the shorter significant run is the smaller number and
  // otherwise a plain lexical comparison already orders them by value.
  if (aValue.length !== bValue.length) {
    return aValue.length - bValue.length;
  }
  if (aValue !== bValue) {
    return aValue < bValue ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * Total, environment-independent order over bucket keys.
 *
 * Deliberately not `localeCompare`/`Intl.Collator`. Those order by the host's
 * collation data, so the same set of keys can order differently on two machines
 * - and this order is what seeds a positional display set identity. Worse, with
 * `{ numeric: true }` a collator reports *equality* for keys differing only in
 * zero padding (`["r","01"]` vs `["r","1"]`); `Array.prototype.sort` is stable,
 * so equal-comparing keys then keep their input order, reintroducing exactly the
 * input-order dependence this module exists to prevent.
 *
 * Runs of digits compare by value, so a group keyed on instance 10 sorts after
 * one keyed on instance 2 rather than lexically before it; everything else
 * compares by UTF-16 code unit. Only genuinely identical keys compare equal.
 */
function compareSplitKeys(a: string, b: string): number {
  let aIndex = 0;
  let bIndex = 0;

  while (aIndex < a.length && bIndex < b.length) {
    if (isDigitAt(a, aIndex) && isDigitAt(b, bIndex)) {
      const aEnd = digitRunEnd(a, aIndex);
      const bEnd = digitRunEnd(b, bIndex);
      const byDigits = compareDigitRuns(
        a.slice(aIndex, aEnd),
        b.slice(bIndex, bEnd)
      );
      if (byDigits !== 0) {
        return byDigits;
      }
      aIndex = aEnd;
      bIndex = bEnd;
      continue;
    }

    const aCode = a.charCodeAt(aIndex);
    const bCode = b.charCodeAt(bIndex);
    if (aCode !== bCode) {
      return aCode - bCode;
    }
    aIndex += 1;
    bIndex += 1;
  }

  // One key is a prefix of the other: the shorter sorts first.
  return a.length - aIndex - (b.length - bIndex);
}

/**
 * Key parts an instance contributes through its rule's `groupBy`.
 */
function buildBaseKeyParts(
  instance: NaturalizedInstance,
  context: RuleContext,
  splitRule: SplitRule
): unknown[] {
  const groupBy = splitRule.groupBy ?? ['SeriesInstanceUID'];
  return groupBy.map((key) =>
    typeof key === 'function' ? key(instance, context) : instance[key]
  );
}

/**
 * Builds the split key an instance is grouped under for a given rule.
 *
 * The key is **namespaced by the rule** (via `ruleDiscriminator`) so two
 * different rules can never share a bucket even if their split values coincide,
 * and it is **JSON-encoded** so the parts can't collide through a separator -
 * e.g. an `&` inside a tag value, or `undefined` vs `''` vs a missing tag, which
 * a plain string join would alias together.
 *
 * The discriminator is the rule's `id`, NOT its position in the rule set:
 * position would make every key below an inserted rule change, silently
 * invalidating any identity derived from the split.
 */
function buildSplitKey(
  ruleDiscriminator: string,
  baseKeyParts: unknown[]
): string {
  return JSON.stringify([ruleDiscriminator, ...baseKeyParts]);
}

/**
 * Groups instances into instance groups using the first matching split rule per
 * instance (rules are evaluated in order; first match wins).
 *
 * Each rule's optional `series` hook runs **once** here (per rule, per call),
 * in priority order, and extends one series context that every rule reads
 * through the {@link RuleContext} - see {@link computeSeriesFacts}. The first
 * rule that computes a name wins.
 *
 * The split key of a group is `[ruleId, ...groupBy values]`, and nothing else
 * groups instances. A run of consecutive instances (an ultrasound series that
 * alternates single images and clips) is a `groupBy` value too: the `runs`
 * series function gives each instance the identity of its run.
 *
 * Groups are returned in a **deterministic order** - by the position of the rule
 * that produced them, then by split key - so a series' display sets are stable
 * regardless of the order the imageIds were passed in. The key comparison is
 * numeric-aware, so a group keyed on instance 10 sorts after instance 2 rather
 * than lexically before it.
 *
 * `ruleSet` is keyed by rule id, and its rules are tried in ascending priority
 * (see `resolveSplitRuleSet`).
 *
 * Instances *within* a group are ordered by their rule's
 * {@link SplitRule.compareInstances}, defaulting to acquisition order, so nothing
 * about the result - which groups, their order, or their contents' order - depends
 * on the order the instances were passed in.
 *
 * @param onUnmatched - called for each instance that matches no rule and is
 *   therefore placed in no group (e.g. a non-image SOP such as an SR or
 *   presentation state). Lets callers observe what was dropped instead of it
 *   disappearing silently.
 * @throws if a rule set entry is invalid (see `validateSplitRuleSetEntry`).
 */
export function groupInstancesBySplitRules(
  instances: NaturalizedInstance[],
  ruleSet: SplitRuleSet,
  onUnmatched?: (instance: NaturalizedInstance) => void,
  options: GroupInstancesOptions = {}
): InstanceGroup[] {
  // Resolved ahead of the empty-input shortcut: an invalid rule set is broken
  // whether or not there are instances to split, and reporting it only for a
  // non-empty series would let it through in exactly the case a caller is least
  // likely to be testing.
  const splitRules = resolveSplitRuleSet(ruleSet);

  if (!instances.length) {
    return [];
  }

  // Derive the series context once for this split operation, so the
  // per-instance `matches`/`groupBy` only read an already-computed value.
  const sharedContext: RuleContext = {
    series: computeSeriesFacts(instances, splitRules),
  };
  const ruleContexts: RuleContext[] = splitRules.map(() => sharedContext);

  // Claim instances first, then group the instances of each rule.
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

  const baseKeyParts = splitRules.map((splitRule, ruleIndex) => {
    const context = ruleContexts[ruleIndex];
    const parts = new Map<NaturalizedInstance, unknown[]>();

    for (const instance of claimedByRule[ruleIndex]) {
      if (!parts.has(instance)) {
        parts.set(instance, buildBaseKeyParts(instance, context, splitRule));
      }
    }

    return parts;
  });

  const ruleOrderers = splitRules.map((rule, ruleIndex) =>
    buildInstanceOrderer(rule, ruleContexts[ruleIndex], options)
  );

  const instancesMap = new Map<string, InstanceGroup>();
  // The rule's position orders the groups, and stays out of the key: that is
  // the point of the id-based discriminator.
  const groupRuleIndex = new Map<string, number>();

  for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
    const splitRule = splitRules[ruleIndex];

    for (const instance of claimedByRule[ruleIndex]) {
      const parts = baseKeyParts[ruleIndex].get(instance);
      const key = buildSplitKey(splitRule.id, parts);

      let group = instancesMap.get(key);
      if (!group) {
        group = {
          instances: [],
          matchedRule: splitRule,
          // The facts of the whole split, not of this group - see
          // `InstanceGroup.series`.
          series: ruleContexts[ruleIndex].series,
          splitKey: key,
        };
        instancesMap.set(key, group);
        groupRuleIndex.set(key, ruleIndex);
      }
      group.instances.push(instance);
    }
  }

  const groups = Array.from(instancesMap.values());

  // Order each group's instances by its rule's comparator. Grouping decides which
  // instances belong together; the rule decides what order they belong in - and
  // leaving them in input order would make a display set's frame order depend on
  // the order the imageIds arrived in, which nothing else about the result does.
  for (const group of groups) {
    const ruleIndex = groupRuleIndex.get(group.splitKey ?? '') ?? 0;
    group.instances = ruleOrderers[ruleIndex](group.instances);
  }

  return groups.sort((a, b) => {
    const aKey = a.splitKey ?? '';
    const bKey = b.splitKey ?? '';
    const ruleOrder =
      (groupRuleIndex.get(aKey) ?? 0) - (groupRuleIndex.get(bKey) ?? 0);
    return ruleOrder !== 0 ? ruleOrder : compareSplitKeys(aKey, bKey);
  });
}
