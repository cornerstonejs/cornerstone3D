import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';

const engineA = new RenderingEngine('A');
const engineB = new RenderingEngine('B');

export async function show(seriesA: string[], seriesB: string[]) {
  const viewport = engineA.getViewport('axial');
  const twin = engineB.getViewport('axial');

  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, seriesA[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds: seriesA,
  });
  await viewport.setDisplaySets({ displaySetId });
  const displaySetId2 = JSON.stringify([viewport.renderingEngineId, viewport.id, seriesB[0]]);
  displaySetRegistry.add(displaySetId2, {
    imageIds: seriesB,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId2, options: { initialImageIdIndex: 3 } });
  const displaySetId3 = JSON.stringify([twin.renderingEngineId, twin.id, seriesA[0]]);
  displaySetRegistry.add(displaySetId3, {
    imageIds: seriesA,
  });
  await twin.setDisplaySets({ displaySetId: displaySetId3 });
  const imageIds = getSeries();
  const displaySetId4 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId4, {
    imageIds,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId4, options: { initialImageIdIndex: 1 } });
}

declare function getSeries(): string[];
