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
import { displaySetContextFor, withInstances } from './displaySetContext';
import { sortInstancesCopy } from './sortInstances';
import { hasNoValue, isUnsafeKey } from '../safeFunctions';

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
 * The order each group's `instances` are returned in. Each layer defers to the
 * one below it:
 *
 *  1. The default order, {@link sortByInstanceNumber}, never the input order.
 *     It is also the final tie-break.
 *  2. The host's base sort ({@link GroupInstancesOptions.sortInstances}), a
 *     whole-list sort. Ties keep step 1, because `Array.prototype.sort` is stable.
 *  3. Comparators: {@link SplitRule.compareInstances}, then
 *     {@link GroupInstancesOptions.compareInstances}. The first finite non-zero
 *     result decides; 0 and `NaN` mean no opinion.
 *
 * See "Who decides instance order" in
 * `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
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
    let ordered = sortInstancesCopy(instances);

    if (baseSort) {
      // Copied because a host sort may return the array it was handed, and the
      // comparator pass below sorts in place.
      ordered = [...baseSort(ordered, orderContext)];
    }

    if (comparators.length) {
      const compare = chainComparators(comparators);
      // The order of one display set: a displaySet.<name> reads these
      // instances, and a bare name reads the series.
      const sortContext: RuleContext = {
        ...context,
        displaySet: displaySetContextFor(context.series, ordered),
      };
      ordered.sort((a, b) => compare(a, b, sortContext));
    }

    return ordered;
  };
}

/**
 * Returns `instances` in the order of `splitRule` (see `buildInstanceOrderer`),
 * for a host that orders a display set again outside a split, for example
 * after new instances arrive. It is the one implementation of the order.
 *
 * Pass the group's {@link InstanceGroup.series} as `options.series`. Without
 * it, only this rule's `series` hook computes the facts, from `instances`
 * alone. With it, the context values are computed again over the split and
 * any new instances, so a `sortBy` name such as `sliceDistance` stays correct.
 */
export function orderInstancesForRule(
  instances: NaturalizedInstance[],
  splitRule: SplitRule,
  options: OrderInstancesOptions = {}
): NaturalizedInstance[] {
  const context: RuleContext = {
    series: options.series
      ? withInstances(options.series, instances)
      : computeSeriesFacts(sortInstancesCopy(instances), [splitRule]),
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
 * One `groupBy` value in the form that every host gives, so that a server and
 * a viewer that naturalize differently build the same split key:
 *
 * - no value (absent, `null`, `''`, `[]`) is `null`;
 * - a one-element array is its element (`[5]` is `5`);
 * - a string that is the canonical text of a finite number is that number
 *   (`'5'` is `5`). `'05'` and `'1.50'` stay text, so two identifiers that
 *   differ only in zeros do not merge.
 */
export function normalizeSplitKeyPart(value: unknown): unknown {
  if (hasNoValue(value)) {
    return null;
  }
  if (Array.isArray(value)) {
    const parts = value.map(normalizeSplitKeyPart);
    return parts.length === 1 ? parts[0] : parts;
  }
  if (typeof value === 'string') {
    const number = Number(value);
    return Number.isFinite(number) && String(number) === value ? number : value;
  }
  return value;
}

/**
 * Key parts an instance contributes through its rule's `groupBy`, normalized
 * by {@link normalizeSplitKeyPart}.
 */
function buildGroupByParts(
  instance: NaturalizedInstance,
  context: RuleContext,
  splitRule: SplitRule
): unknown[] {
  const groupBy = splitRule.groupBy ?? ['SeriesInstanceUID'];
  return groupBy.map((key) =>
    normalizeSplitKeyPart(
      typeof key === 'function' ? key(instance, context) : instance[key]
    )
  );
}

/**
 * Builds the split key an instance is grouped under for a given rule.
 *
 * The key is **namespaced by the rule** (via `ruleDiscriminator`) so two
 * different rules can never share a bucket even if their split values coincide,
 * and it is **JSON-encoded** so the parts can't collide through a separator -
 * e.g. an `&` inside a tag value. The parts are already normalized, so every
 * kind of "no value" gives `null`, and `5`, `'5'` and `[5]` give `5`.
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
 * Groups instances by the first matching split rule of `ruleSet` (keyed by rule
 * id, tried in ascending priority; see `resolveSplitRuleSet`).
 *
 * - The split sorts a copy of the input one time into the default order,
 *   {@link sortByInstanceNumber}
 *   (`InstanceNumber`, then `SOPInstanceUID`) before anything else, so the
 *   series functions never see the input order.
 * - Each rule's `series` hook runs once, in priority order, and extends one
 *   series context (see {@link computeSeriesFacts}); the first rule that
 *   computes a name wins.
 * - The split key of a group is `[ruleId, ...groupBy values]`.
 * - Groups are ordered by rule position, then by a numeric-aware split key
 *   order. Instances in a group are ordered by `buildInstanceOrderer`. So no
 *   part of the result depends on the input order.
 *
 * @param onUnmatched - called for each instance that matches no rule and is
 *   therefore placed in no group, so callers can see what was dropped.
 * @throws if a rule set entry is invalid (see `validateSplitRuleSetEntry`).
 */
export function groupInstancesBySplitRules(
  instances: NaturalizedInstance[],
  ruleSet: SplitRuleSet,
  onUnmatched?: (instance: NaturalizedInstance) => void,
  options: GroupInstancesOptions = {}
): InstanceGroup[] {
  // Resolve before the empty-input return, so an invalid rule set always throws.
  const splitRules = resolveSplitRuleSet(ruleSet);

  if (!instances.length) {
    return [];
  }

  // One sort into the default order, so every series function and every
  // later step sees the same order for the same series.
  const sorted = sortInstancesCopy(instances);

  // Derive the series context once for this split operation, so the
  // per-instance `matches`/`groupBy` only read an already-computed value.
  const context: RuleContext = {
    series: computeSeriesFacts(sorted, splitRules),
  };

  // Claim instances first, then group the instances of each rule.
  const claimedByRule: NaturalizedInstance[][] = splitRules.map(() => []);

  for (const instance of sorted) {
    let matched = false;

    for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
      const splitRule = splitRules[ruleIndex];
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

  const ruleOrderers = splitRules.map((rule) =>
    buildInstanceOrderer(rule, context, options)
  );

  const instancesMap = new Map<string, InstanceGroup>();
  // The rule's position orders the groups, and stays out of the key: that is
  // the point of the id-based discriminator.
  const groupRuleIndex = new Map<string, number>();

  for (let ruleIndex = 0; ruleIndex < splitRules.length; ruleIndex++) {
    const splitRule = splitRules[ruleIndex];

    for (const instance of claimedByRule[ruleIndex]) {
      const key = buildSplitKey(
        splitRule.id,
        buildGroupByParts(instance, context, splitRule)
      );

      let group = instancesMap.get(key);
      if (!group) {
        group = {
          instances: [],
          matchedRule: splitRule,
          // The facts of the whole split, not of this group - see
          // `InstanceGroup.series`.
          series: context.series,
          splitKey: key,
        };
        instancesMap.set(key, group);
        groupRuleIndex.set(key, ruleIndex);
      }
      group.instances.push(instance);
    }
  }

  const groups = Array.from(instancesMap.values());

  // Order each group's instances by its rule, never by the input order.
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
