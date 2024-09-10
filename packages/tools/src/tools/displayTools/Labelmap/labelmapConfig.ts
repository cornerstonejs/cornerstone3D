import type { LabelmapStyle } from '../../../types/LabelmapTypes';

const defaultLabelmapConfig: LabelmapStyle = {
  renderOutline: true,
  outlineWidthActive: 3,
  outlineWidthInactive: 2,
  activeSegmentOutlineWidthDelta: 0,
  renderFill: true,
  renderFillInactive: true,
  fillAlpha: 0.7,
  fillAlphaInactive: 0.65,
  outlineOpacity: 1,
  outlineOpacityInactive: 0.85,
};

function getDefaultLabelmapStyle(): LabelmapStyle {
  return defaultLabelmapConfig;
}

export default getDefaultLabelmapStyle;
