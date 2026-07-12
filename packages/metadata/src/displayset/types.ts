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
  customAttributes?: (
    attributes: SplitRuleCustomAttributesContext,
    options: SplitRuleOptions
  ) => Record<string, unknown>;
};

export type SplitContext = {
  getNaturalizedInstance: (imageId: string) => NaturalizedInstance | undefined;
};

export type InstanceGroup = {
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
