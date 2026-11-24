import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';

const first = new RenderingEngine('a:b');
const second = new RenderingEngine('a');

export async function show(imageIds: string[]) {
  const left = first.getViewport('c');
  const right = second.getViewport('b:c');

  const displaySetId = JSON.stringify([left.renderingEngineId, left.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds,
    initialImageIdIndex: 0,
  });
  await left.setDisplaySets({ displaySetId });
  const displaySetId2 = JSON.stringify([right.renderingEngineId, right.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId2, {
    imageIds,
    initialImageIdIndex: 5,
  });
  await right.setDisplaySets({ displaySetId: displaySetId2 });
}
