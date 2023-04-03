import { ContourConfig } from '../../../types/ContourTypes';

const defaultContourConfig: ContourConfig = {
  renderOutline: true,
  outlineWidthActive: 1,
  outlineWidthInactive: 2,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
  renderFill: true,
  fillAlpha: 1,
  fillAlphaInactive: 0,
};

function getDefaultContourConfig(): ContourConfig {
  return defaultContourConfig;
}

export default getDefaultContourConfig;
