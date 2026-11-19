import type { PlanarViewport } from '@cornerstonejs/core';
import { Enums, RenderingEngine } from '@cornerstonejs/core';

const { ViewportType } = Enums;
const engine = new RenderingEngine('engine');

engine.setViewports([
  {
    viewportId: 'axial',
    element,
    type: ViewportType.PLANAR,
    defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
  },
  { viewportId: '3d', element: element3d, type: ViewportType.VOLUME_3D },
  { viewportId: 'video', element: videoElement, type: 'video' },
]);

const viewport = engine.getViewport<PlanarViewport>('axial');

if (
  viewport.getCurrentMode() === 'volume' &&
  viewport.type === ViewportType.PLANAR
) {
  console.log('a volume');
}
