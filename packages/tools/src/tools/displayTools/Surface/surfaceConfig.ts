import { SurfaceRenderingConfig } from '../../../types/SurfaceTypes.js';

const defaultSurfaceConfig: SurfaceRenderingConfig = {
  renderFill: true,
  fillAlpha: 1,
};

function getDefaultSurfaceConfig(): SurfaceRenderingConfig {
  return defaultSurfaceConfig;
}

export default getDefaultSurfaceConfig;
