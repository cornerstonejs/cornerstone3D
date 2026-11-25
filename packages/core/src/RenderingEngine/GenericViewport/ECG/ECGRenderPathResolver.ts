import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { CanvasECGPath } from './CanvasECGRenderPath';

export function createDefaultECGRenderPaths(): RenderPathDefinition[] {
  return [new CanvasECGPath()];
}

export function createECGRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultECGRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
