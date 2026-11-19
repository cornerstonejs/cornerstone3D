import type { Types } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export function planarOnly(id: string, type: Enums.ViewportType) {
  if (type !== Enums.ViewportType.VOLUME_3D) {
    return engine.getViewport(id) as Types.IVolumeViewport;
  }
}

export function either(
  id: string,
  type: Enums.ViewportType,
  other: Types.IViewport
) {
  if (
    type === Enums.ViewportType.ORTHOGRAPHIC ||
    other.type === Enums.ViewportType.VOLUME_3D
  ) {
    return engine.getViewport(id) as Types.IVolumeViewport;
  }
}

export function tested(viewport: Types.IViewport) {
  if (viewport.type === Enums.ViewportType.VOLUME_3D) {
    return viewport as Types.IVolumeViewport;
  }
}
