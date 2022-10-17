import { LabelmapConfig } from '../../../types/LabelmapTypes';

const defaultLabelmapConfig: LabelmapConfig = {
  renderOutline: true,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  renderFill: true,
  renderFillInactive: true,
  fillAlpha: 0.7,
  fillAlphaInactive: 0.65,
  outlineOpacity: 1,
  // Todo: not supported yet
  // outlineOpacityInactive: 0.35,
};

function getDefaultLabelmapConfig(): LabelmapConfig {
  return defaultLabelmapConfig;
}

// Checks if the labelmap config is valid, which means
// if all the required fields are present and have the correct type
function isValidLabelmapConfig(config): boolean {
  return (
    config &&
    typeof config.renderOutline === 'boolean' &&
    typeof config.outlineWidthActive === 'number' &&
    typeof config.outlineWidthInactive === 'number' &&
    typeof config.renderFill === 'boolean' &&
    typeof config.renderFillInactive === 'boolean' &&
    typeof config.fillAlpha === 'number' &&
    typeof config.fillAlphaInactive === 'number' &&
    typeof config.outlineOpacity === 'number'
  );
}

export default getDefaultLabelmapConfig;
export { isValidLabelmapConfig };
