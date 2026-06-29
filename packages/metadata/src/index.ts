import * as calculateSUV from '@cornerstonejs/calculate-suv';

export * as Enums from './enums';
export { version } from './version';
export * as metaData from './metaData';
export * as utilities from './utilities';
export * as displaySet from './displayset';
export type {
  IDisplaySet,
  BaseDisplaySetOptions,
  ImageStackDisplaySetOptions,
  ResolveInstancesOptions,
  SplitImageIdsBySplitRulesOptions,
  RegisterDisplaySetMetadataOptions,
  NaturalizedInstance,
  SeriesInfo,
  SplitRule,
  SplitContext,
  SplitRuleOptions,
  SplitRuleCustomAttributesContext,
  InstanceGroup,
  ViewportTypeHint,
} from './displayset';
export {
  BaseDisplaySet,
  ImageStackDisplaySet,
  resolveInstances,
  buildSeriesInfo,
  groupInstancesBySplitRules,
  splitImageIdsBySplitRules,
  registerDisplaySetMetadata,
  registerDisplaySetProviders,
  defaultDisplaySetSplitRules,
  createDisplaySetFromGroup,
  isImageInstance,
  isVideoInstance,
  isEcgInstance,
  isWsiInstance,
  getViewportTypesForRule,
  getPreferredViewportType,
  getViewportTypesForGroup,
} from './displayset';
export type { CreateDisplaySetFromGroupOptions } from './displayset';
export * as logging from './utilities/logging';
export { registerDefaultProviders } from './registerDefaultProviders';
export type * from './types';

const { calculateSUVScalingFactors } = calculateSUV;

export { calculateSUVScalingFactors };
