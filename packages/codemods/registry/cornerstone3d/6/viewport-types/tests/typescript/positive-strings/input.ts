import { RenderingEngine } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

engine.setViewports([
  { viewportId: 'a', element: elementA, type: 'stack' },
  {
    viewportId: 'b',
    element: elementB,
    type: 'orthographic',
  },
  { viewportId: 'c', element: elementC, type: 'planarNext' },
  { viewportId: 'd', element: elementD, type: 'ecgNext' },
]);

const viewport = engine.getViewport('a');

if (viewport.type === 'stack') {
  console.log('a stack');
}

if (viewport.type === 'videoNext') {
  console.log('a video');
}
