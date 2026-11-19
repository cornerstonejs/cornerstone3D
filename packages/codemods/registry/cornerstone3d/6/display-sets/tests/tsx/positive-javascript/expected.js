import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';

async function run(element, imageIds) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'stack',
    type: Enums.ViewportType.PLANAR,
    element,
  });

  const viewport = renderingEngine.getViewport('stack');

  utilities.genericViewportDisplaySetMetadataProvider.add(`${viewport.id}:stack`, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId: `${viewport.id}:stack` });
}

export default run;
