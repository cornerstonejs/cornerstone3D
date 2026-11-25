import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

function windowOf(viewport: Types.IVolumeViewport) {
  return viewport.getProperties().voiRange;
}

export function volumeIdsOf(viewport: Types.IBaseVolumeViewport, other) {
  return [viewport, other];
}

export function run(element: HTMLDivElement, viewportOfApp: Types.IViewport) {
  engine.enableElement({
    viewportId: 'ct',
    type: Enums.ViewportType.ORTHOGRAPHIC,
    element,
  });

  const ct = engine.getViewport('ct') as Types.IVolumeViewport;

  windowOf(ct);
  windowOf(viewportOfApp);
  volumeIdsOf(ct, engine.getViewport('vr'));
}
