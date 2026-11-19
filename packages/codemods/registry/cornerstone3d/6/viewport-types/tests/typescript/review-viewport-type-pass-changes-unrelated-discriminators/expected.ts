import { RenderingEngine, Enums } from '@cornerstonejs/core';

const card = { type: 'stack', element: document.body };
const panel = {
  type: 'orthographic',
  viewportId: 'panel',
  element: document.body,
};

const renderingEngine = new RenderingEngine('engine');
const input = { viewportId: 'CT', type: 'planar', element: document.body };

renderingEngine.enableElement(input);
renderingEngine.setViewports([
  { viewportId: 'MPR', type: 'planar', defaultOptions: { orientation: Enums.OrientationAxis.AXIAL }, element: document.body },
]);

export { card, panel };
