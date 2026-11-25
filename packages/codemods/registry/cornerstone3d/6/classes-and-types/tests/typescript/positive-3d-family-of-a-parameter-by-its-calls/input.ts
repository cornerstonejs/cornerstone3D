import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  LegacyVolumeViewport3D,
  RenderingEngine,
  Enums,
} from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

function prepareForPicking(viewport: BaseVolumeViewport) {
  return viewport.getDefaultActor();
}

const volumeIdsOf = (viewport: Types.IBaseVolumeViewport) =>
  viewport.getAllVolumeIds();

export function run(element: HTMLDivElement, other: HTMLDivElement) {
  engine.setViewports([
    { viewportId: 'ct', type: Enums.ViewportType.ORTHOGRAPHIC, element },
    { viewportId: 'vr', type: Enums.ViewportType.VOLUME_3D, element: other },
  ]);

  const volume3D = engine.getViewport('vr') as LegacyVolumeViewport3D;
  const vr = engine.getViewport('vr') as Types.IVolumeViewport;
  const ct = engine.getViewport('ct') as Types.IVolumeViewport;

  prepareForPicking(volume3D);
  prepareForPicking(vr);
  volumeIdsOf(vr);
  volumeIdsOf(ct);
}
