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
  ruleSelector?: (
    instance: NaturalizedInstance,
    seriesInfo: SeriesInfo
  ) => boolean;
  splitKey?: (
    | string
    | ((instance: NaturalizedInstance, seriesInfo: SeriesInfo) => unknown)
  )[];
  updateSeriesInfo?: (
    instances: NaturalizedInstance[],
    seriesInfo: SeriesInfo
  ) => SeriesInfo | void;
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
};
