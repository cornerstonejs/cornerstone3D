import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';

const first = new RenderingEngine('a:b');
const second = new RenderingEngine('a');

export async function show(imageIds: string[]) {
  const left = first.getViewport('c');
  const right = second.getViewport('b:c');

  const displaySetId = JSON.stringify([left.renderingEngineId, left.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId, {
    imageIds,
  });
  await left.setDisplaySets({ displaySetId, options: { initialImageIdIndex: 0 } });
  const displaySetId2 = JSON.stringify([right.renderingEngineId, right.id, imageIds[0]]);
  displaySetRegistry.add(displaySetId2, {
    imageIds,
  });
  await right.setDisplaySets({ displaySetId: displaySetId2, options: { initialImageIdIndex: 5 } });
}
