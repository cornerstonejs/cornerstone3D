import type { Types, PlanarViewport } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

function windowOf(viewport: PlanarViewport) {
  return viewport.getProperties().voiRange;
}

export function volumeIdsOf(viewport: PlanarViewport, other) {
  return [viewport, other];
}

export function run(element: HTMLDivElement, viewportOfApp: Types.IViewport) {
  engine.enableElement({
    viewportId: 'ct',
    type: Enums.ViewportType.ORTHOGRAPHIC,
    element,
  });

  const ct = engine.getViewport<PlanarViewport>('ct');

  windowOf(ct);
  windowOf(viewportOfApp);
  volumeIdsOf(ct, engine.getViewport('vr'));
}
