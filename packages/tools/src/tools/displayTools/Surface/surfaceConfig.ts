import { SurfaceRenderingConfig } from '../../../types/SurfaceTypes';

const defaultContourConfig: SurfaceRenderingConfig = {
  renderFill: true,
  fillAlpha: 1,
};

function getDefaultSurfaceConfig(): SurfaceRenderingConfig {
  return defaultContourConfig;
}

export default getDefaultSurfaceConfig;
