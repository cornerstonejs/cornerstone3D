import { displaySetRegistry } from '@cornerstonejs/core';

export async function show(viewport, imageIds) {
  displaySetRegistry.add('ct', {
    imageIds,
  });
  await viewport.setDisplaySets({ displaySetId: 'ct', options: { role: 'source', initialImageIdIndex: 3 } });

  return <div data-display-set="ct">{imageIds.length}</div>;
}
