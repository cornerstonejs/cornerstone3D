import { RenderingEngine, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');

const stackViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsStackCompatibility);
const volumeViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsVolumeCompatibility);
const viewport = renderingEngine.getViewport('viewport-1');
if (!utilities.viewportSupportsStackCompatibility(viewport)) {
  throw new Error('Viewport does not support setStack');
}

viewport.setStack(['image-1']);
console.log(stackViewports, volumeViewports);
