import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');

export async function fromGetter(model: { imageIds: string[] }) {
  const viewport = engine.getViewport('getter');
  const imageIds2 = model.imageIds;
  const displaySetId = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds2[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds: imageIds2,
  });
  await viewport.setDisplaySets({ displaySetId });
}

export async function fromIndex(series: string[][], index: number) {
  const viewport = engine.getViewport('index');
  const imageIds3 = series[index];
  const displaySetId2 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds3[0]]);
  displaySetRegistry.add(displaySetId2, {
    imageIds: imageIds3,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId2, options: { initialImageIdIndex: index } });
}

export async function fromArrayOfReads(model: { first: string }) {
  const viewport = engine.getViewport('array');
  const imageIds4 = [model.first, 'b'];
  const displaySetId3 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds4[0]]);
  displaySetRegistry.add(displaySetId3, {
    imageIds: imageIds4,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId3 });
}

export async function fromSpread(ids: string[]) {
  const viewport = engine.getViewport('spread');
  const imageIds5 = [...ids];
  const displaySetId4 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds5[0]]);
  displaySetRegistry.add(displaySetId4, {
    imageIds: imageIds5,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId4 });
}

export async function fromName(imageIds: string[]) {
  const viewport = engine.getViewport('name');
  const displaySetId5 = JSON.stringify([viewport.renderingEngineId, viewport.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId5, {
    imageIds,
  });
  await viewport.setDisplaySets({ displaySetId: displaySetId5, options: { initialImageIdIndex: 2 } });
}
