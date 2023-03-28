import { ContourConfig } from '../../../types/ContourTypes';

const defaultContourConfig: ContourConfig = {
  renderOutline: true,
  outlineWidthActive: 2,
  outlineWidthInactive: 2,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
};

function getDefaultContourConfig(): ContourConfig {
  return defaultContourConfig;
}

export default getDefaultContourConfig;
