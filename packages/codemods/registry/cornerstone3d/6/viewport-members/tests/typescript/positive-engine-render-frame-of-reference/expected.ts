import { RenderingEngine, getRenderingEngine } from '@cornerstonejs/core';
import type { BaseRenderingEngine } from '@cornerstonejs/core';

const renderingEngine = new RenderingEngine('engine');
const store = { renderFrameOfReference: (uid: string) => uid };

renderingEngine.renderFrameOfReference('frame');
getRenderingEngine('engine')?.renderFrameOfReference('frame');
store.renderFrameOfReference('frame');

function renderFrame(engine: BaseRenderingEngine, uid: string) {
  engine['renderFrameOfReference'](uid);
  renderingEngine.renderViewports(['viewport']);
}

console.log(renderFrame);
