import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { HtmlVideoPath } from './HtmlVideoRenderPath';

export function createDefaultVideoRenderPaths(): RenderPathDefinition[] {
  return [new HtmlVideoPath()];
}

export function createVideoRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultVideoRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
