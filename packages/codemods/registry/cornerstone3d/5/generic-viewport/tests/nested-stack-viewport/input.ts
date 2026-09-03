import { RenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');
const _wrappedViewport = wrap(renderingEngine.getStackViewport('viewport-1'));
