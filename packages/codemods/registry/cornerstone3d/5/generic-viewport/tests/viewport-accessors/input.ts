import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');

const _stackViewports = renderingEngine.getStackViewports();
const _volumeViewports = renderingEngine.getVolumeViewports();
const viewport = renderingEngine.getStackViewport('viewport-1');

viewport.setStack(['image-1']);
