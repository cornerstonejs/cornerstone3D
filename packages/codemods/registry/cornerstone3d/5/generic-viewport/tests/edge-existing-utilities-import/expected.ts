import { RenderingEngine, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');
const stackViewports = renderingEngine
  .getViewports()
  .filter(utilities.viewportSupportsStackCompatibility);

console.log(utilities, stackViewports);
