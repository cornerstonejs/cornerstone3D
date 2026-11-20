import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';

async function run(element, imageIds) {
  const renderingEngine = new RenderingEngine('engine');

  renderingEngine.enableElement({
    viewportId: 'stack',
    type: Enums.ViewportType.PLANAR,
    element,
  });

  const viewport = renderingEngine.getViewport('stack');

  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
}

export default run;
