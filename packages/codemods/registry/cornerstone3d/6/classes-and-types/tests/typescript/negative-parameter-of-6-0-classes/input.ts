import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

function volumeIdsOf(viewport: PlanarViewport | VolumeViewport3D) {
  return viewport.getVolumeIds();
}

function presetOf(viewport: VolumeViewport3D) {
  return viewport.getDisplaySetAppearance()?.preset;
}

export function run(element: HTMLDivElement, other: HTMLDivElement) {
  engine.setViewports([
    { viewportId: 'ct', type: Enums.ViewportType.PLANAR, element },
    { viewportId: 'vr', type: Enums.ViewportType.VOLUME_3D, element: other },
  ]);

  const ct = engine.getViewport<PlanarViewport>('ct');
  const vr = engine.getViewport<VolumeViewport3D>('vr');

  volumeIdsOf(ct);
  volumeIdsOf(vr);
  presetOf(vr);
}
