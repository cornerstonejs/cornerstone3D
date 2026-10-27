import type { DisplaySetContextValues } from './displaySetContext';

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

/**
 * The generic handler names of the default rules. A rule `handler` names the
 * kind of object, and a host maps the name to its own code (OHIF: a SOP class
 * handler). A rule can use another name; the compile does not check it.
 */
export const DISPLAY_SET_HANDLER_NAMES = [
  'image',
  'video',
  'wholeSlide',
  'ecg',
  'segmentation',
  'rtStructureSet',
  'parametricMap',
  'structuredReport',
  'encapsulatedDocument',
  'bulkAnnotation',
  'chart',
  'unsupported',
] as const;

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
 * The series context of one split: values computed once from the whole
 * series, and read back by every rule through {@link RuleContext}.
 *
 * A compiled data-form rule keeps one entry here, `displaySetContext`: the values of
 * the display set context for the series, computed at the first read and kept
 * in a cache (see `displaySetContext.ts`). A rule in code can add its own
 * entries with its `series` hook. **The first rule, in priority order, that
 * computes a name wins**: a later rule that gives the same name reads the
 * earlier value.
 */
export type SeriesFacts = Record<string, unknown>;

/**
 * Argument to a rule's `series` hook: the whole resolved series, and the facts
 * that the earlier rules computed.
 */
export type SeriesContext = {
  instances: NaturalizedInstance[];
  /**
   * The facts computed so far, by the rules before this one in priority order.
   * Read only. The engine always passes it; optional so that a direct call
   * with `{ instances }` alone stays valid.
   */
  series?: Readonly<SeriesFacts>;
};

/** The scope of a result field of a series function. */
export type SeriesFieldScope = 'series' | 'instance';

/**
 * A function that computes one summary of the whole series, for a group entry
 * of the display set context (`{ "function": name, "args": { ... } }`).
 *
 * Must be pure, and must not depend on the order of `instances`: the split
 * result must not depend on the order the instances arrived in.
 */
export type SeriesFunction = (
  instances: NaturalizedInstance[],
  context: {
    /** The evaluated `args` of the group entry. An empty object when it has none. */
    args: Readonly<Record<string, unknown>>;
  }
) => unknown;

/**
 * A series function and its result fields. A rule reads a field by path
 * (`timeClusters.start`), and the compile rejects a field that is not here.
 * An `instance` field holds a map keyed by `instanceKey` (the
 * `SOPInstanceUID`, else the `imageId`), and a read gives the value of one
 * instance.
 */
export type SeriesFunctionDefinition = {
  compute: SeriesFunction;
  /** The result fields. Omitted: the fields are not checked, and have the series scope. */
  fields?: Readonly<Record<string, SeriesFieldScope>>;
};

/**
 * Argument to a rule's `matches` predicate, `groupBy` extractors and
 * `compareInstances`: the series context of the split. Shared by every rule -
 * see {@link SeriesFacts}.
 */
export type RuleContext = {
  series: SeriesFacts;
  /**
   * The context values of one display set, in a sort of its instances. A
   * `displaySet.<name>` in `sortBy` reads them, so a series function such as
   * `planeGeometry` runs over the instances of the display set. Absent in
   * `matches` and `groupBy`, which read the series.
   */
  displaySet?: DisplaySetContextValues;
};

export type SplitRuleCustomAttributesContext = {
  instance: NaturalizedInstance;
  isMultiFrame?: boolean;
  sopClassUids?: string[];
  [key: string]: unknown;
};

export type SplitRuleOptions = {
  instances: NaturalizedInstance[];
  splitNumber?: number;
  descriptionName?: string;
  /**
   * The series context of the split (see {@link InstanceGroup.series}), so
   * that a display set attribute reads the values of the whole series.
   */
  series?: SeriesFacts;
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
  /**
   * The generic name of the handler for the display sets of this rule (see
   * {@link DISPLAY_SET_HANDLER_NAMES}). `createDisplaySetFromGroup` copies it
   * to the display set. No handler: the display set needs none (an image).
   */
  handler?: string;
  /**
   * Optional. Runs once per split operation, before matching, in priority
   * order, and returns facts that extend the shared series context - read back
   * by every rule's `matches`, `groupBy` and `compareInstances`
   * through `context.series`. A name that an earlier rule already computed
   * keeps the earlier value (see {@link SeriesFacts}).
   *
   * Use it when a rule needs a value computed from the whole series (e.g. "does
   * this series mix b-value and non-b-value frames?", or the slice spacing).
   * Must be pure: return facts, do not mutate `context.series`.
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
   * Optional. Orders the instances this rule claims, in each group's
   * {@link InstanceGroup.instances}: negative if `a` comes before `b`, positive
   * if `b` comes before `a`. The third argument carries this rule's derived
   * `series` facts. Example: `(a, b) => a.SliceLocation - b.SliceLocation`.
   *
   * It need not be a total order. **0 or `NaN` means no opinion**: the host's
   * comparator decides next, then the base order of
   * {@link GroupInstancesOptions.sortInstances}, then acquisition order
   * (`InstanceNumber`, then `SOPInstanceUID`). See "Who decides instance
   * order" in `packages/docs/docs/concepts/cornerstone-metadata/display-sets.md`.
   */
  compareInstances?: (
    a: NaturalizedInstance,
    b: NaturalizedInstance,
    context: RuleContext
  ) => number;
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
   * The default rules use the priorities `1..n`, in their documented order, and
   * the catch-all `unsupported` runs last, at `Number.MAX_SAFE_INTEGER`. A
   * priority below `0` therefore runs before every default rule, and a priority
   * above {@link DEFAULT_SPLIT_RULE_PRIORITY_LIMIT} runs after every other
   * default rule and before `unsupported`.
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
 * The highest priority the default rules may use, except the catch-all
 * `unsupported`, which runs last at `Number.MAX_SAFE_INTEGER`. A rule with a
 * priority above this value runs after every other default rule, and before
 * `unsupported`, so it sees the instances that no other default claims.
 */
export const DEFAULT_SPLIT_RULE_PRIORITY_LIMIT = 10000;

/**
 * What a sort hook is told about the instances it is ordering.
 */
export type InstanceOrderContext = {
  /** The rule that claimed these instances. */
  matchedRule: SplitRule;
  /** The series context of the split. */
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
 * order defined by whoever calls the engine, so two consumers of one rule set
 * could order the same display set differently while both appearing correct.
 *
 * A later revision is expected to let a rule set carry its sort as data; when it
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
   * The series context to order with - normally the
   * {@link InstanceGroup.series} of the group the instances came from. Omitted,
   * the facts are computed from the instances being ordered, by this rule's
   * `series` hook alone, which can differ from the facts the split used (see
   * {@link InstanceGroup.series}).
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
   * The series context of this split: the `series` hooks of every rule applied
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
