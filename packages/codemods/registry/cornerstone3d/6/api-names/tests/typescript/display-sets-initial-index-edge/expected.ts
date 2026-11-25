import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

function pick(imageIds: string[]) {
  return imageIds.length - 1;
}

export function register(imageIds: string[]) {
  displaySetRegistry.add('elsewhere', { imageIds, initialImageIdIndex: 2 });
}

async function run(imageIds: string[], options: object, viewport) {
  const renderingEngine = new RenderingEngine('engine');
  const stack = renderingEngine.getViewport<PlanarViewport>('STACK');
  let index = 1;

  index += 1;
  displaySetRegistry.add('written', { imageIds, initialImageIdIndex: index });
  await stack.setDisplaySets({ displaySetId: 'written' });

  displaySetRegistry.add('called', {
    imageIds,
    initialImageIdIndex: pick(imageIds),
  });
  await stack.setDisplaySets({ displaySetId: 'called' });

  displaySetRegistry.add('notLiteral', { imageIds, initialImageIdIndex: 1 });
  await stack.setDisplaySets({ displaySetId: 'notLiteral', options });

  displaySetRegistry.add('byName', { imageIds });
  await viewport.setDisplaySets({ displaySetId: 'byName', options: { initialImageIdIndex: 1 } });

  const descriptor = { imageIds, initialImageIdIndex: 1 };

  displaySetRegistry.add('sharedA', descriptor);
  displaySetRegistry.add('sharedB', descriptor);
  await stack.setDisplaySets({ displaySetId: 'sharedA' });

  displaySetRegistry.add('only3D', { imageIds, initialImageIdIndex: 1 });

  const volume3D = renderingEngine.getViewport<VolumeViewport3D>('3D');

  await volume3D.setDisplaySets({ displaySetId: 'only3D' });

  displaySetRegistry.add('mountWins', { imageIds });
  await stack.setDisplaySets({
    displaySetId: 'mountWins',
    options: { initialImageIdIndex: 5 },
  });

  displaySetRegistry.add('fromParameter', {
    imageIds,
    initialImageIdIndex: imageIds.length - 1,
  });
  await later(stack);
}

async function later(stack: PlanarViewport) {
  await stack.setDisplaySets({ displaySetId: 'fromParameter' });
}

run(['a', 'b'], {}, undefined);
