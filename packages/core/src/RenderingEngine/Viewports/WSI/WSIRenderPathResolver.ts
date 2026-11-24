import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { DicomMicroscopyPath } from './DicomMicroscopyRenderPath';

export function createDefaultWSIRenderPaths(): RenderPathDefinition[] {
  return [new DicomMicroscopyPath()];
}

export function createWSIRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultWSIRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
