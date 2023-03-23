import { ContourConfig } from '../../../types/ContourTypes';

const defaultLabelmapConfig: ContourConfig = {
  renderOutline: true,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
};

function getDefaultContourConfig(): ContourConfig {
  return defaultLabelmapConfig;
}

export default getDefaultContourConfig;
