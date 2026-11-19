import { RenderingEngine, utilities } from '@cornerstonejs/core';

const engineA = new RenderingEngine('A');
const engineB = new RenderingEngine('B');

export async function show(seriesA: string[], seriesB: string[]) {
  const viewport = engineA.getViewport('axial');
  const twin = engineB.getViewport('axial');

  const displaySetId = `${viewport.renderingEngineId}:${viewport.id}:${seriesA[0]}`;
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: seriesA,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
  const displaySetId2 = `${viewport.renderingEngineId}:${viewport.id}:${seriesB[0]}`;
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId2, {
    kind: 'planar',
    imageIds: seriesB,
    initialImageIdIndex: 3,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId2 });
  const displaySetId3 = `${twin.renderingEngineId}:${twin.id}:${seriesA[0]}`;
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId3, {
    kind: 'planar',
    imageIds: seriesA,
    initialImageIdIndex: 0,
  });
  await twin.setDisplaySets({ displaySetId: displaySetId3 });
  const imageIds = getSeries();
  const displaySetId4 = `${viewport.renderingEngineId}:${viewport.id}:${imageIds[0]}`;
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId4, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 1,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId4 });
}

declare function getSeries(): string[];
