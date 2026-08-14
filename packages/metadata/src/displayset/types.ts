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
  | string;

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
   * Stable identifier for this rule, unique within its rule set. It namespaces
   * every bucket key the rule produces (see {@link InstanceGroup.splitKey}), so
   * naming a rule is what makes the identities derived from it survive editing
   * the rule set - reordering rules, or inserting one, leaves other rules'
   * keys untouched. A rule set containing duplicate ids is rejected.
   *
   * Rules without an id fall back to their array position, whose keys therefore
   * change when the rule set is edited. Give every rule an id if anything
   * durable (persisted annotations, saved layouts) is keyed off the split.
   */
  id?: string;
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
   * It need not be a total order. Ties - a returned 0, or a `NaN` out of
   * arithmetic on a tag one instance is missing - fall back to acquisition order,
   * so an incomplete comparator cannot make the result depend on the order the
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
   * starts a new one. The run's ordinal is folded into the bucket key, so
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
   */
  runBy?: (instance: NaturalizedInstance, context: RuleContext) => unknown;
  customAttributes?: (
    attributes: SplitRuleCustomAttributesContext,
    options: SplitRuleOptions
  ) => Record<string, unknown>;
};

export type SplitContext = {
  getNaturalizedInstance: (imageId: string) => NaturalizedInstance | undefined;
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
   * Deterministic, rule-namespaced bucket key this group was collected under.
   * Stable for a given set of instances regardless of input order, so it can
   * seed a stable display set identity. Set by `groupInstancesBySplitRules`;
   * optional so hand-built groups don't need it.
   */
  splitKey?: string;
};
