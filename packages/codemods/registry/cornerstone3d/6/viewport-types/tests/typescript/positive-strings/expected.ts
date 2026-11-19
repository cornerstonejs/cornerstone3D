import { RenderingEngine, Enums } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

engine.setViewports([
  { viewportId: 'a', element: elementA, type: 'planar' },
  {
    viewportId: 'b',
    element: elementB,
    type: 'planar',
    defaultOptions: { orientation: Enums.OrientationAxis.AXIAL },
  },
  { viewportId: 'c', element: elementC, type: 'planar' },
  { viewportId: 'd', element: elementD, type: 'ecg' },
]);

const viewport = engine.getViewport('a');

if (viewport.type === 'stack') {
  console.log('a stack');
}

if (viewport.type === 'video') {
  console.log('a video');
}
