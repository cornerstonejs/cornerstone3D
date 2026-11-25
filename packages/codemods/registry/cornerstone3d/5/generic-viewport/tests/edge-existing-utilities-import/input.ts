import { RenderingEngine, utilities } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('default');
const stackViewports = renderingEngine.getStackViewports();

console.log(utilities, stackViewports);
