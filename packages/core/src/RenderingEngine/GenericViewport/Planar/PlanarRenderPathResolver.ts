import { DefaultRenderPathResolver } from '../DefaultRenderPathResolver';
import type { RenderPathDefinition } from '../ViewportArchitectureTypes';
import { CpuImageSlicePath } from './CpuImageSliceRenderPath';
import { CpuVolumeSlicePath } from './CpuVolumeSliceRenderPath';
import { VtkImageMapperPath } from './VtkImageMapperRenderPath';
import { VtkVolumeSlicePath } from './VtkVolumeSliceRenderPath';

export function createDefaultPlanarRenderPaths(): RenderPathDefinition[] {
  return [
    new CpuImageSlicePath(),
    new CpuVolumeSlicePath(),
    new VtkImageMapperPath(),
    new VtkVolumeSlicePath(),
  ];
}

export function createPlanarRenderPathResolver(
  paths: ReadonlyArray<RenderPathDefinition> = createDefaultPlanarRenderPaths()
): DefaultRenderPathResolver {
  return new DefaultRenderPathResolver(paths);
}
