import { createRegisteredPlanarRenderPaths } from '../../helpers/renderBackendRegistry';
import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { CpuImageSlicePath } from './CpuImageSliceRenderPath';
import { CpuVolumeSlicePath } from './CpuVolumeSliceRenderPath';
import { VtkImageMapperPath } from './VtkImageMapperRenderPath';
import { VtkVolumeSlicePath } from './VtkVolumeSliceRenderPath';

/**
 * The built-in planar render paths (the 'gpu' and 'cpu' backends' modes) plus
 * the render paths of every extension backend's render modes registered via
 * `registerRenderBackend({ renderModes: { image: { createDefinition } } })`.
 */
export function createDefaultPlanarRenderPaths(): RenderPathDefinition[] {
  return [
    new CpuImageSlicePath(),
    new CpuVolumeSlicePath(),
    new VtkImageMapperPath(),
    new VtkVolumeSlicePath(),
    ...createRegisteredPlanarRenderPaths(),
  ];
}

export function createPlanarRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultPlanarRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
