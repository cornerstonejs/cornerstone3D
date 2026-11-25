import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');
const _wrappedViewport = wrap(renderingEngine.getViewport('viewport-1'));
