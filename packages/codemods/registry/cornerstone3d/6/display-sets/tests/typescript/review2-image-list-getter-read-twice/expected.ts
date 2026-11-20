import { RenderingEngine, utilities } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export async function fromGetter(model: { imageIds: string[] }) {
  const viewport = engine.getViewport('getter');
  const imageIds2 = model.imageIds;
  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds2[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: imageIds2,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId });
}

export async function fromIndex(series: string[][], index: number) {
  const viewport = engine.getViewport('index');
  const imageIds3 = series[index];
  const displaySetId2 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds3[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId2, {
    kind: 'planar',
    imageIds: imageIds3,
    initialImageIdIndex: index,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId2 });
}

export async function fromArrayOfReads(model: { first: string }) {
  const viewport = engine.getViewport('array');
  const imageIds4 = [model.first, 'b'];
  const displaySetId3 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds4[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId3, {
    kind: 'planar',
    imageIds: imageIds4,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId3 });
}

export async function fromSpread(ids: string[]) {
  const viewport = engine.getViewport('spread');
  const imageIds5 = [...ids];
  const displaySetId4 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds5[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId4, {
    kind: 'planar',
    imageIds: imageIds5,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId4 });
}

export async function fromName(imageIds: string[]) {
  const viewport = engine.getViewport('name');
  const displaySetId5 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId5, {
    kind: 'planar',
    imageIds,
    initialImageIdIndex: 2,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId5 });
}
