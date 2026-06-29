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

export type SeriesInfo = {
  NumberOfSeriesRelatedInstances: number;
  numberOfFrames: number;
  numImageFrames: number;
  numberOfNonImageObjects: number;
  numberOfSOPInstanceUIDsPerSeries: number;
  isMultiFrame?: boolean;
  mixedBValue?: boolean;
  supportsVolume3d?: boolean;
  [key: string]: unknown;
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
   * Predicate deciding whether this rule claims a given instance. Omit to match
   * every instance (a catch-all rule). Evaluated in rule order; first match wins.
   */
  matches?: (instance: NaturalizedInstance, seriesInfo: SeriesInfo) => boolean;
  /**
   * Recipe for the bucket an instance is grouped under once this rule claims it:
   * an ordered list of tag names and/or extractor functions. Instances whose
   * parts are all equal land in the same group (one group -> one display set).
   * Defaults to `['SeriesInstanceUID']` (one group per series). The computed
   * result is stored on the produced {@link InstanceGroup} as `splitKey`.
   */
  groupBy?: (
    | string
    | ((instance: NaturalizedInstance, seriesInfo: SeriesInfo) => unknown)
  )[];
  /**
   * Runs once over the whole series before selection. Contributes series-level
   * flags by **mutating** the passed `seriesInfo` (the return value is ignored).
   */
  updateSeriesInfo?: (
    instances: NaturalizedInstance[],
    seriesInfo: SeriesInfo
  ) => void;
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
