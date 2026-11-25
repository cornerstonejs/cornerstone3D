import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';

const store = {
  add(id: string, value: object) {
    return { id, value };
  },
};

async function run(imageIds: string[]) {
  const renderingEngine = new RenderingEngine('engine');

  displaySetRegistry.add('ct', { imageIds });
  store.add('ct', { imageIds, initialImageIdIndex: 3 });

  const stack = renderingEngine.getViewport<PlanarViewport>('STACK');

  await stack.setDisplaySets({
    displaySetId: 'ct',
    options: { initialImageIdIndex: 3 },
  });

  const volume3D = renderingEngine.getViewport<VolumeViewport3D>('3D');

  await volume3D.setDisplaySets({ displaySetId: 'ct' });
}

run(['a', 'b']);
