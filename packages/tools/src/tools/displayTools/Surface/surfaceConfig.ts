import { SurfaceRenderingConfig } from '../../../types/SurfaceTypes';

const defaultSurfaceConfig: SurfaceRenderingConfig = {
  renderFill: true,
  fillAlpha: 1,
};

function getDefaultSurfaceConfig(): SurfaceRenderingConfig {
  return defaultSurfaceConfig;
}

export default getDefaultSurfaceConfig;
