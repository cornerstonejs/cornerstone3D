import type { Types, PlanarViewport } from '@cornerstonejs/core';
import {
  VolumeViewport3D,
  RenderingEngine,
  Enums,
} from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

function prepareForPicking(viewport: VolumeViewport3D) {
  return viewport.getDefaultActor();
}

const volumeIdsOf = (viewport: Types.IBaseVolumeViewport) =>
  viewport.getAllVolumeIds();

export function run(element: HTMLDivElement, other: HTMLDivElement) {
  engine.setViewports([
    { viewportId: 'ct', type: Enums.ViewportType.ORTHOGRAPHIC, element },
    { viewportId: 'vr', type: Enums.ViewportType.VOLUME_3D, element: other },
  ]);

  const volume3D = engine.getViewport('vr') as VolumeViewport3D;
  const vr = engine.getViewport<VolumeViewport3D>('vr');
  const ct = engine.getViewport<PlanarViewport>('ct');

  prepareForPicking(volume3D);
  prepareForPicking(vr);
  volumeIdsOf(vr);
  volumeIdsOf(ct);
}
