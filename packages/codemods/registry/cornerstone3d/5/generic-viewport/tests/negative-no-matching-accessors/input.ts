import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');

const viewport = renderingEngine.getViewport('viewport-1');
const viewports = renderingEngine.getViewports();

console.log(viewport, viewports);
