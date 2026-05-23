import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { VtkGeometry3DPath } from './VtkGeometry3DRenderPath';
import { VtkVolume3DPath } from './VtkVolume3DRenderPath';

export function createDefaultVolume3DRenderPaths(): RenderPathDefinition[] {
  return [new VtkVolume3DPath(), new VtkGeometry3DPath()];
}

export function createVolume3DRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultVolume3DRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
