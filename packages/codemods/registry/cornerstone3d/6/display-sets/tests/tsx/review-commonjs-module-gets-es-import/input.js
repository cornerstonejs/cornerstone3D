const { RenderingEngine } = require('@cornerstonejs/core');

async function show(imageIds) {
  const renderingEngine = new RenderingEngine('engine');
  const viewport = renderingEngine.getViewport('CT');

  await viewport.setStack(imageIds);
}

module.exports = { show };
