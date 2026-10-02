/**
 * Naturalized DICOM instance used by display-set split rules and metadata.
 * OHIF naturalized instances satisfy this type; additional tags are allowed.
 */
export type NaturalizedInstance = {
  imageId?: string;
  Modality?: string;
  SOPClassUID?: string;
  Rows?: number;
  Columns?: number;
  NumberOfFrames?: number;
  SliceLocation?: number;
  SeriesInstanceUID?: string;
  InstanceNumber?: number;
  DiffusionBValue?: number;
  TransferSyntaxUID?: string;
  AvailableTransferSyntaxUID?: string;
  [key: string]: unknown;
};

export type ViewportTypeHint =
  | 'stack'
  | 'volume'
  | 'volume3d'
  | 'video'
  | 'wholeslide'
  | 'ecg'
  /**
   * No viewport can render this display set - see {@link NO_VIEWPORT_TYPE}. The
   * display set still exists (so a study browser can list it and say why it is
   * not viewable), but it must not be handed to a viewport. Read it as
   * `displaySet.isDisplayable === false`.
   */
  | 'none'
  | string;

/**
 * The `viewportTypes` entry meaning "nothing can render this".
 *
 * Deliberately an explicit sentinel rather than an empty `viewportTypes` array:
 * an absent or empty list falls back to `['stack']` (see
 * {@link getViewportTypesForRule}), so "empty" cannot express "not renderable"
 * without that fallback silently turning a non-image object into a stack.
 */
export const NO_VIEWPORT_TYPE = 'none';

/**
 * Series-level statistics aggregated once over a series' instances (see
 * {@link buildSeriesInfo}). Independent of split rules - a rule derives its own
 * facts through its `series` hook (see {@link RuleContext}), not here.
 */
export type SeriesInfo = {
  NumberOfSeriesRelatedInstances: number;
  numberOfFrames: number;
  numImageFrames: number;
  numberOfNonImageObjects: number;
  numberOfSOPInstanceUIDsPerSeries: number;
  [key: string]: unknown;
};

/**
 * Derived series-level facts a rule's `series` hook returns, keyed by name and
 * read back by that same rule's `matches`/`groupBy` via {@link RuleContext}.
 */
export type SeriesFacts = Record<string, unknown>;

/**
 * Argument to a rule's `series` hook: the whole resolved series.
 */
export type SeriesContext = {
  instances: NaturalizedInstance[];
};

/**
 * Argument to a rule's `matches` predicate and to its `groupBy` extractor
 * functions: the facts this rule's `series` hook derived (an empty object when
 * the rule has no `series` hook). Scoped per rule - a rule never sees another
 * rule's derived facts.
 */
export type RuleContext = {
  series: SeriesFacts;
};

export type SplitRuleCustomAttributesContext = {
  instance: NaturalizedInstance;
  isMultiFrame?: boolean;
  sopClassUids?: string[];
  viewportTypes?: readonly ViewportTypeHint[];
  [key: string]: unknown;
};

export type SplitRuleOptions = {
  instances: NaturalizedInstance[];
  splitNumber?: number;
  descriptionName?: string;
};

export type SplitRule = {
  /**
   * Stable identifier for this rule: its key in the {@link SplitRuleSet}. It
   * namespaces every bucket key the rule produces (see
   * {@link InstanceGroup.splitKey}), so reordering rules, or inserting one,
   * leaves the other rules' keys untouched.
   */
  id: string;
  /**
   * The group of rules this rule belongs to. Defaults to {@link SplitRule.id}.
   *
   * Several rules can describe one kind of display set: for example one rule
   * for breast tomosynthesis, one for legacy mammography that mixes views in
   * one series, and one for mammography that the modality already split. A
   * reader such as a hanging protocol then matches the group id to find every
   * display set of that kind, whichever rule made it. It does not change how
   * the rule splits: groups and split keys stay per rule id.
   */
  groupId?: string;
  /** Allowed viewport types; index 0 is the preferred viewport type. */
  viewportTypes?: readonly ViewportTypeHint[];
  /**
   * Optional. Runs once per rule per split operation, before matching, and
   * returns derived facts for THIS rule - read back by `matches`/`groupBy`
   * through `context.series`. Use it only when a rule needs a value computed
   * from the whole series (e.g. "does this series mix b-value and non-b-value
   * frames?"). Must be pure: return facts, do not mutate shared state.
   */
  series?: (context: SeriesContext) => SeriesFacts;
  /**
   * Predicate deciding whether this rule claims a given instance. Omit to match
   * every instance (a catch-all rule). Evaluated in rule order; first match wins.
   * The second argument carries this rule's derived `series` facts.
   */
  matches?: (instance: NaturalizedInstance, context: RuleContext) => boolean;
  /**
   * Recipe for the bucket an instance is grouped under once this rule claims it:
   * an ordered list of tag names and/or extractor functions. Instances whose
   * parts are all equal land in the same group (one group -> one display set).
   * Defaults to `['SeriesInstanceUID']` (one group per series). Extractor
   * functions receive this rule's derived `series` facts as their second
   * argument. The computed result is stored on the produced
   * {@link InstanceGroup} as `splitKey`.
   */
  groupBy?: (
    | string
    | ((instance: NaturalizedInstance, context: RuleContext) => unknown)
  )[];
  /**
   * Optional. Orders the instances this rule claims - both the order each group's
   * {@link InstanceGroup.instances} are returned in and the order runs are walked
   * in to number them (see `runBy`). Returns a negative number if `a` comes
   * before `b`, a positive number if `b` comes before `a`, and 0 if they are
   * interchangeable. The third argument carries this rule's derived `series`
   * facts.
   *
   * Defaults to acquisition order: `InstanceNumber`, then `SOPInstanceUID` as a
   * tiebreak. Declare it when that is the wrong order for the display set this
   * rule produces - a reconstructed volume belongs in spatial order, which
   * `InstanceNumber` does not always follow:
   *
   * ```ts
   * {
   *   id: 'volume3d',
   *   compareInstances: (a, b) => a.SliceLocation - b.SliceLocation,
   * }
   * ```
   *
   * It need not be a total order, and is not expected to be. **Returning 0 (or a
   * `NaN`, as arithmetic on a tag one instance is missing produces) declines to
   * have an opinion**, rather than asserting the two are interchangeable: the
   * host's default comparator is consulted next, and failing that the base order
   * stands - the host's {@link GroupInstancesOptions.sortInstances}, itself
   * falling back to acquisition order. So a rule can order by one thing and
   * leave everything else to the default, without restating it, and an
   * incomplete comparator still cannot make the result depend on the order the
   * instances were passed in.
   */
  compareInstances?: (
    a: NaturalizedInstance,
    b: NaturalizedInstance,
    context: RuleContext
  ) => number;
  /**
   * Optional. Declares that this rule's instances form *runs*: walking the
   * instances this rule claimed in acquisition order, consecutive instances
   * whose value here is equal belong to the same run, and a change in value
   * starts a new one. The run's key (see below) is folded into the bucket key, so
   * **interleaved kinds separate instead of merging**.
   *
   * The motivating case is an ultrasound series mixing single images and
   * multi-frame clips - `img1 img2 img3 clip4 img5 clip6` should become four
   * display sets, not two. `groupBy` alone cannot express that, because its
   * extractors see one instance at a time and so cannot tell `img3` from
   * `img5`; grouping on a per-instance discriminator merges them, and grouping
   * on `InstanceNumber` over-splits `img1..img3` into three. A run needs a
   * pass over the ordered series, which is what this field buys:
   *
   * ```ts
   * {
   *   id: 'usInterleaved',
   *   matches: (instance) => instance.Modality === 'US',
   *   runBy: (instance) => Number(instance.NumberOfFrames ?? 1) > 1,
   * }
   * ```
   *
   * Runs are computed over the instances **this rule claimed**, in the rule's own
   * order (`compareInstances`, defaulting to acquisition order) rather than the
   * order the caller supplied - so, like every other key part, the result does
   * not depend on input order. Instances claimed by other rules do not
   * interrupt a run.
   *
   * Runs are also scoped to a single `groupBy` bucket: instances whose `groupBy`
   * parts differ are bound for different display sets anyway, so one never
   * interrupts another's run. Without that scoping, two single frames of one
   * series would be torn apart by another series' clip merely for sitting
   * between them in acquisition order.
   *
   * A run is keyed by its **first instance** in the rule's order (its
   * `SOPInstanceUID`, else its `imageId`), not by its ordinal. An ordinal shifts
   * for every later run when a new run appears earlier in the series, so a key
   * built from it would name a different run after new instances arrive. The
   * first instance changes only when an instance is added ahead of the run. A
   * new instance that splits a run leaves the key with the part that holds the
   * first instance, and the other parts get new keys - so a host reconciling
   * against earlier keys must still expect a run to lose members.
   */
  runBy?: (instance: NaturalizedInstance, context: RuleContext) => unknown;
  customAttributes?: (
    attributes: SplitRuleCustomAttributesContext,
    options: SplitRuleOptions
  ) => Record<string, unknown>;
};

/**
 * One entry of a {@link SplitRuleSet}: a split rule plus the priority that
 * places it in evaluation order.
 */
export type SplitRuleSetEntry = Omit<SplitRule, 'id'> & {
  /**
   * The rule's id. Optional, because the entry's key in the rule set is the id.
   * When present it must equal that key.
   */
  id?: string;
  /**
   * Where this rule is evaluated. Rules run in ascending priority, and the first
   * matching rule wins, so a lower number runs earlier. Equal priorities run in
   * id order, so the order is deterministic.
   *
   * `null` excludes the rule. That is how a customization turns a default rule
   * off without having to remove its key.
   *
   * The default rules use the priorities `1..n`, in their documented order. A
   * priority below `0` therefore runs before every default rule, and a priority
   * above {@link DEFAULT_SPLIT_RULE_PRIORITY_LIMIT} runs after every default
   * rule.
   */
  priority: number | null;
};

/**
 * Split rules keyed by id, with an explicit {@link SplitRuleSetEntry.priority}.
 * This is the only form the split engine takes.
 *
 * Keyed because a rule set is usually built by merging layers - the defaults,
 * then a deployment's overrides, then a mode's. A key cannot occur twice, so a
 * later layer replaces or edits a rule instead of adding a second copy, and
 * the priority lets a layer move or exclude a rule by id.
 */
export type SplitRuleSet = Record<string, SplitRuleSetEntry>;

/**
 * The highest priority the default rules may use. A rule with a priority above
 * this value runs after every default rule.
 */
export const DEFAULT_SPLIT_RULE_PRIORITY_LIMIT = 10000;

/**
 * What a sort hook is told about the instances it is ordering.
 */
export type InstanceOrderContext = {
  /** The rule that claimed these instances. */
  matchedRule: SplitRule;
  /** That rule's derived series facts. */
  series: SeriesFacts;
};

/**
 * A whole-list instance sort.
 *
 * Whole-list rather than a comparator because a real base order is not always
 * pairwise: ordering slices along the scan axis means picking a reference
 * instance and projecting the rest onto its normal, which no `(a, b)` function
 * can express. Ties left alone keep acquisition order.
 */
export type SortInstances = (
  instances: NaturalizedInstance[],
  context: InstanceOrderContext
) => NaturalizedInstance[];

/**
 * Host-supplied defaults for a split operation.
 *
 * Ordering lives here rather than only on a rule because it has to be settable
 * once, for every rule, by whatever application is doing the splitting - and it
 * has to be settable the same way whether that application is a viewer or a
 * server building a study index. A per-rule-only hook would leave the *default*
 * order defined by whoever calls the engine, so two consumers of one selector
 * could order the same display set differently while both appearing correct.
 *
 * A later revision is expected to let a selector carry its sort as data; when it
 * does it will compile to these same hooks, so ownership of ordering does not
 * change hands again.
 */
export type GroupInstancesOptions = {
  /**
   * The base order every rule's instances start in, after acquisition order and
   * before any comparator. Defaults to acquisition order alone.
   */
  sortInstances?: SortInstances;
  /**
   * A comparator consulted after a rule's own {@link SplitRule.compareInstances}
   * and before falling back to the base order. Returning 0 declines to have an
   * opinion rather than asserting equality.
   */
  compareInstances?: SplitRule['compareInstances'];
};

export type SplitContext = {
  getNaturalizedInstance: (imageId: string) => NaturalizedInstance | undefined;
};

/** Options for `orderInstancesForRule`. */
export type OrderInstancesOptions = GroupInstancesOptions & {
  /**
   * The rule's series facts to order with - normally the
   * {@link InstanceGroup.series} of the group the instances came from. Omitted,
   * the facts are computed from the instances being ordered, which can differ
   * from the facts the split used (see {@link InstanceGroup.series}).
   */
  series?: SeriesFacts;
};

export type InstanceGroup = {
  /**
   * The instances collected into this group, ordered by the rule that produced it
   * (see {@link SplitRule.compareInstances}) and so independent of the order they
   * were passed in - as is everything else about the result.
   */
  instances: NaturalizedInstance[];
  matchedRule: SplitRule;
  /**
   * The matched rule's series facts for this split: its `series` hook applied
   * to every instance passed to the split, not only this group's. A host that
   * orders the group again later (see `orderInstancesForRule`) passes these
   * back, so that a comparator reading `context.series` sees the value it saw
   * during the split. Facts computed from the group alone can differ: a
   * "mixed b-value" fact is true for the series and false for each half.
   * Set by `groupInstancesBySplitRules`; optional so hand-built groups don't
   * need it.
   */
  series?: SeriesFacts;
  /**
   * Deterministic, rule-namespaced bucket key this group was collected under.
   * Stable for a given set of instances regardless of input order, so it can
   * seed a stable display set identity. Set by `groupInstancesBySplitRules`;
   * optional so hand-built groups don't need it.
   */
  splitKey?: string;
};
