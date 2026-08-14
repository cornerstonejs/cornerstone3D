import type {
  InstanceGroup,
  NaturalizedInstance,
  RuleContext,
  SplitRule,
} from './types';

/**
 * Numeric value of an instance's `InstanceNumber`, or `undefined` when it has
 * none usable.
 *
 * Deliberately not a bare `Number(...)`: that maps `null`, `''` and whitespace to
 * 0 - a finite number - so an instance with no instance number would alias to 0
 * and sort among (indeed ahead of) the genuinely numbered ones, silently moving
 * run boundaries. Only a real number or a numeric string counts.
 */
function instanceNumberOf(instance: NaturalizedInstance): number | undefined {
  // Read as `unknown` rather than the declared `number`: naturalized DICOM
  // routinely delivers an IS value as a string, or as null for an empty element.
  const raw: unknown = instance.InstanceNumber;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : undefined;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Canonical acquisition order, and the default a rule gets when it declares no
 * {@link SplitRule.compareInstances}.
 *
 * Deliberately *not* the caller's input order: an order derived from input order
 * would make run ordinals - and so bucket keys - depend on the order imageIds
 * happened to be passed in, which is exactly the property this module guarantees
 * against. `InstanceNumber` is the acquisition sequence; `SOPInstanceUID` breaks
 * ties so the order is total even when instance numbers are absent or duplicated.
 */
function compareByAcquisition(
  a: NaturalizedInstance,
  b: NaturalizedInstance
): number {
  const aNumber = instanceNumberOf(a);
  const bNumber = instanceNumberOf(b);
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
 * The order a rule's instances are taken to be in: both the order runs are walked
 * in to number them and the order each group's `instances` are returned in.
 *
 * A rule may declare {@link SplitRule.compareInstances} because acquisition order
 * is not always the order a display set's frames belong in - a reconstructed
 * volume belongs in spatial order, which `InstanceNumber` does not always follow.
 *
 * Whatever the rule returns is tie-broken by {@link compareByAcquisition}, so a
 * comparator that is not total - 0 for two distinct instances, or `NaN` out of
 * arithmetic on a missing tag - cannot quietly hand ordering back to
 * `Array.prototype.sort`'s stability and so to the caller's input order.
 */
function buildInstanceComparator(
  splitRule: SplitRule,
  context: RuleContext
): (a: NaturalizedInstance, b: NaturalizedInstance) => number {
  const declared = splitRule.compareInstances;
  if (!declared) {
    return compareByAcquisition;
  }

  return (a, b) => {
    const order = declared(a, b, context);
    return Number.isFinite(order) && order !== 0
      ? order
      : compareByAcquisition(a, b);
  };
}

/**
 * Assigns each instance the ordinal of the run it belongs to.
 *
 * Runs are computed **per bucket**, not across every instance the rule claimed.
 * Instances whose `groupBy` parts differ are already destined for different
 * display sets, so letting one interrupt another's run would split a bucket on
 * the unrelated content of its neighbours - e.g. one series' multi-frame clip
 * sitting between another series' two single frames in acquisition order would
 * tear those two frames into separate display sets. Ordinals restart at 0 in
 * each bucket, which is safe because the bucket's own key parts are already part
 * of the split key.
 *
 * Within a bucket, walks the instances in the rule's order (see
 * {@link buildInstanceComparator}) and increments the ordinal every time `runBy`
 * returns a value differing from the previous instance's - so a series of
 * `single single single clip single clip` yields runs `0 0 0 1 2 3`.
 *
 * Keyed by object identity rather than by UID: the caller passes the very same
 * instance objects to `groupInstancesBySplitRules`, and object identity avoids
 * assuming every instance carries a `SOPInstanceUID`.
 */
function buildRunIndex(
  instances: NaturalizedInstance[],
  baseKeyParts: Map<NaturalizedInstance, unknown[]>,
  runBy: NonNullable<SplitRule['runBy']>,
  compare: (a: NaturalizedInstance, b: NaturalizedInstance) => number,
  context: RuleContext
): Map<NaturalizedInstance, number> {
  const buckets = new Map<string, NaturalizedInstance[]>();

  for (const instance of instances) {
    const bucketKey = JSON.stringify(baseKeyParts.get(instance));
    const bucket = buckets.get(bucketKey);
    if (bucket) {
      bucket.push(instance);
    } else {
      buckets.set(bucketKey, [instance]);
    }
  }

  const runIndex = new Map<NaturalizedInstance, number>();

  for (const bucket of buckets.values()) {
    const ordered = [...bucket].sort(compare);

    let currentRun = -1;
    let previousValue: unknown;
    let hasPrevious = false;

    for (const instance of ordered) {
      const value = runBy(instance, context);
      // Compare structurally so equal object/array values (e.g. an ImageType
      // array rebuilt per instance) do not start a spurious new run through
      // reference inequality. `Object.is` would treat every fresh array as a
      // change.
      if (!hasPrevious || !isSameRunValue(previousValue, value)) {
        currentRun += 1;
      }
      runIndex.set(instance, currentRun);
      previousValue = value;
      hasPrevious = true;
    }
  }

  return runIndex;
}

/**
 * Structural equality for {@link SplitRule.runBy} values, deciding whether two
 * consecutive instances continue the same run.
 *
 * Deliberately not `JSON.stringify` equality. That throws `Converting circular
 * structure to JSON` out of the caller's `groupInstancesBySplitRules` call for a
 * self-referential value, is sensitive to key insertion order (so `{a, b}` and
 * `{b, a}` would start a spurious new run), and serializes every `Map`/`Set` to
 * `{}` so unequal ones compare equal.
 *
 * `Set` members and `Map` keys are matched by identity, there being no
 * meaningful structural lookup for them; everything else compares by own
 * enumerable keys. A pair already under comparison higher up the stack counts as
 * equal, so a self-referential value is equal to itself instead of recursing
 * forever.
 */
function isSameRunValue(
  a: unknown,
  b: unknown,
  stack: [object, object][] = []
): boolean {
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

  for (const [seenA, seenB] of stack) {
    if (seenA === a && seenB === b) {
      return true;
    }
  }
  const nested: [object, object][] = [...stack, [a, b]];

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => isSameRunValue(item, b[index], nested));
  }

  if (a instanceof Date || b instanceof Date) {
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) {
      return false;
    }
    for (const item of a) {
      if (!b.has(item)) {
        return false;
      }
    }
    return true;
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) {
      return false;
    }
    for (const [key, value] of a) {
      if (!b.has(key) || !isSameRunValue(value, b.get(key), nested)) {
        return false;
      }
    }
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      isSameRunValue(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        nested
      )
  );
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
 * Key parts an instance contributes through its rule's `groupBy`, before the run
 * ordinal is appended.
 *
 * Computed once per instance and reused, because they are needed twice: to
 * partition the rule's instances into buckets for run numbering, and to build the
 * final key. `groupBy` extractors are caller-supplied, so calling each of them
 * twice per instance is worth avoiding.
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
  ruleDiscriminator: string | number,
  baseKeyParts: unknown[],
  runIndex: Map<NaturalizedInstance, number> | undefined
): string {
  return JSON.stringify(
    runIndex
      ? [ruleDiscriminator, ...baseKeyParts, runIndex.get(instance)]
      : [ruleDiscriminator, ...baseKeyParts]
  );
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
 * position - documented on {@link SplitRule.id} as the unstable case. That
 * fallback is the position as a **number**, not as a string: the discriminator
 * occupies one slot of the key shared with caller-supplied ids, so any string
 * form (`"#1"`) could be typed as an `id` by a caller and silently merge an
 * unnamed rule's buckets with that rule's. `id` is a string, so a number cannot
 * collide with one.
 */
function resolveRuleDiscriminators(
  splitRules: SplitRule[]
): (string | number)[] {
  const seen = new Set<string>();

  return splitRules.map((rule, ruleIndex) => {
    if (rule.id === undefined) {
      return ruleIndex;
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
 * A rule declaring {@link SplitRule.runBy} additionally has each of its buckets
 * walked in order to number the runs its instances form, so interleaved kinds (an
 * ultrasound series alternating single images and clips) separate rather than
 * merging into one bucket.
 *
 * Groups are returned in a **deterministic order** - by the position of the rule
 * that produced them, then by bucket key - so a series' display sets are stable
 * regardless of the order the imageIds were passed in. The key comparison is
 * numeric-aware, so a group keyed on instance 10 sorts after instance 2 rather
 * than lexically before it.
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
 * @throws if two rules in `splitRules` share an `id`.
 */
export function groupInstancesBySplitRules(
  instances: NaturalizedInstance[],
  splitRules: SplitRule[],
  onUnmatched?: (instance: NaturalizedInstance) => void
): InstanceGroup[] {
  // Validated ahead of the empty-input shortcut: a rule set with duplicate ids
  // is broken whether or not there are instances to split, and reporting it only
  // for a non-empty series would let it through in exactly the case a caller is
  // least likely to be testing.
  const ruleDiscriminators = resolveRuleDiscriminators(splitRules);

  if (!instances.length) {
    return [];
  }

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

  const ruleComparators = splitRules.map((rule, ruleIndex) =>
    buildInstanceComparator(rule, ruleContexts[ruleIndex])
  );

  const runIndexes = splitRules.map((rule, ruleIndex) =>
    rule.runBy
      ? buildRunIndex(
          claimedByRule[ruleIndex],
          baseKeyParts[ruleIndex],
          rule.runBy,
          ruleComparators[ruleIndex],
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

    for (const instance of claimedByRule[ruleIndex]) {
      const key = buildSplitKey(
        instance,
        ruleDiscriminators[ruleIndex],
        baseKeyParts[ruleIndex].get(instance),
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

  const groups = Array.from(instancesMap.values());

  // Order each group's instances by its rule's comparator. Grouping decides which
  // instances belong together; the rule decides what order they belong in - and
  // leaving them in input order would make a display set's frame order depend on
  // the order the imageIds arrived in, which nothing else about the result does.
  for (const group of groups) {
    const ruleIndex = groupRuleIndex.get(group.splitKey ?? '') ?? 0;
    group.instances.sort(ruleComparators[ruleIndex]);
  }

  return groups.sort((a, b) => {
    const ruleOrder =
      (groupRuleIndex.get(a.splitKey ?? '') ?? 0) -
      (groupRuleIndex.get(b.splitKey ?? '') ?? 0);
    if (ruleOrder !== 0) {
      return ruleOrder;
    }
    return compareSplitKeys(a.splitKey ?? '', b.splitKey ?? '');
  });
}
