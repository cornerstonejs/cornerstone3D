import { RenderingEngine, Enums } from '@cornerstonejs/core';

async function run(element, imageIds) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'stack',
    type: Enums.ViewportType.PLANAR,
    element,
  });

  const viewport = renderingEngine.getViewport('stack');

  await viewport.setStack(imageIds, 0);
}

export default run;
