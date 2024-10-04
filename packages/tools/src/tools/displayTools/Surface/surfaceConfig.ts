import type { SurfaceStyle } from '../../../types/SurfaceTypes';

const defaultSurfaceConfig: SurfaceStyle = {
  renderFill: true,
  fillAlpha: 1,
};

function getDefaultSurfaceStyle(): SurfaceStyle {
  return defaultSurfaceConfig;
}

export default getDefaultSurfaceStyle;
