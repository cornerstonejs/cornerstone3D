import { displaySetRegistry } from '@cornerstonejs/core';

export async function show(viewport, imageIds) {
  displaySetRegistry.add('ct', {
    imageIds,
    initialImageIdIndex: 3,
  });
  await viewport.setDisplaySets({ displaySetId: 'ct', options: { role: 'source' } });

  return <div data-display-set="ct">{imageIds.length}</div>;
}
