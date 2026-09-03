import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');

const stackViewports = renderingEngine.getStackViewports();
const volumeViewports = renderingEngine.getVolumeViewports();
const viewport = renderingEngine.getStackViewport('viewport-1');

viewport.setStack(['image-1']);
console.log(stackViewports, volumeViewports);
