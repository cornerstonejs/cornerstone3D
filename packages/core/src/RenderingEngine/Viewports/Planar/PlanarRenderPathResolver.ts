import { createRegisteredPlanarRenderPaths } from '../../helpers/renderBackendRegistry';
import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { CanvasFramePath } from './CanvasFrameRenderPath';
import { CanvasCpuSlicePath } from './CanvasCpuSliceRenderPath';
import { VtkFramePath } from './VtkFrameRenderPath';
import { VtkGpuVolumeSlicePath } from './VtkGpuVolumeSliceRenderPath';
import { VtkCpuSlicePath } from './VtkCpuSliceRenderPath';

/**
 * The built-in planar render paths (the 'gpu' and 'cpu' backends' modes) plus
 * the render paths of every extension backend's render modes registered via
 * `registerRenderBackend({ renderModes: { image: { createDefinition } } })`.
 */
export function createDefaultPlanarRenderPaths(): RenderPathDefinition[] {
  return [
    new CanvasFramePath(),
    new CanvasCpuSlicePath(),
    new VtkFramePath(),
    new VtkGpuVolumeSlicePath(),
    new VtkCpuSlicePath(),
    ...createRegisteredPlanarRenderPaths(),
  ];
}

export function createPlanarRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultPlanarRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
