import { RenderingEngine, displaySetRegistry } from '@cornerstonejs/core';
import type { PlanarViewport, VolumeViewport3D } from '@cornerstonejs/core';
import { mountElsewhere } from './mount';

interface AppViewer {
  setDisplaySets(entry: { displaySetId: string }): Promise<void>;
}

const descriptor = {
  imageIds: ['a', 'b'],
  volumeId: 'cornerstoneStreamingImageVolume:CT',
};

function getViewport(id: string): PlanarViewport {
  return new RenderingEngine('engine').getViewport<PlanarViewport>(id);
}

async function run(
  viewport,
  appViewer: AppViewer,
  mountOptions: Record<string, unknown>
) {
  displaySetRegistry.add('held', descriptor);
  displaySetRegistry.add('spread', { ...descriptor, volumeId: 'v-spread' });
  displaySetRegistry.add('hidden', { ...descriptor });
  displaySetRegistry.add('elsewhere', {
    imageIds: ['c'],
    volumeId: 'cornerstoneStreamingImageVolume:ELSEWHERE',
  });
  displaySetRegistry.add('byName', { imageIds: ['d'], volumeId: 'v-d' });
  displaySetRegistry.add('appViewer', { imageIds: ['g'], volumeId: 'v-g' });
  displaySetRegistry.add('either', { imageIds: ['h'], volumeId: 'v-h' });
  displaySetRegistry.add('heldOptions', { imageIds: ['e'], volumeId: 'v-e' });
  displaySetRegistry.add('spreadOptions', { imageIds: ['f'], volumeId: 'v-f' });

  await getViewport('HELD').setDisplaySets({ displaySetId: 'held' });
  await getViewport('SPREAD').addDisplaySet('spread', {
    role: 'overlay',
  });
  await getViewport('HIDDEN').setDisplaySets({ displaySetId: 'hidden' });
  mountElsewhere('elsewhere');
  await viewport.setDisplaySets({ displaySetId: 'byName' });
  await appViewer.setDisplaySets({ displaySetId: 'appViewer' });

  const engine = new RenderingEngine('engine');
  let eitherViewport = engine.getViewport<PlanarViewport>('PLANAR');
  eitherViewport = engine.getViewport<VolumeViewport3D>('3D');
  await eitherViewport.setDisplaySets({ displaySetId: 'either' });
  await engine
    .getViewport<PlanarViewport | VolumeViewport3D>('MIXED')
    .setDisplaySets({ displaySetId: 'either' });
  await getViewport('OPTIONS').setDisplaySets({
    displaySetId: 'heldOptions',
    options: mountOptions,
  });
  await getViewport('OPTIONS').setDisplaySets({
    displaySetId: 'spreadOptions',
    options: { ...mountOptions },
  });

  const options = { orientation: 'axial' };

  await getViewport('OPTIONS').setDisplaySets({
    displaySetId: 'heldOptions',
    options,
  });
}

run(getViewport('A'), getViewport('B'), {});
