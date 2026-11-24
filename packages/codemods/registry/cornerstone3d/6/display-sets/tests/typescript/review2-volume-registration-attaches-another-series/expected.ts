import {
  RenderingEngine,
  volumeLoader,
  displaySetRegistry,
} from '@cornerstonejs/core';

const engine = new RenderingEngine('engine');
const imagesA = ['a-1', 'a-2'];
const sharedVolumeId = 'cornerstoneStreamingImageVolume:A';

export async function prepare(volumeId: string) {
  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: imagesA });
}

export async function show(volumeId: string) {
  const viewport = engine.getViewport('ct');
  await viewport.setVolumes([{ volumeId }]);
}

export async function createdElsewhere() {
  const viewport = engine.getViewport('ct');
  await viewport.setVolumes([{ volumeId: sharedVolumeId }]);
}

export async function conditionalCreation(flag: boolean) {
  const viewport = engine.getViewport('ct');

  if (flag) {
    await volumeLoader.createAndCacheVolume(sharedVolumeId, {
      imageIds: imagesA,
    });
  }

  await viewport.setVolumes([{ volumeId: sharedVolumeId }]);
}

export async function sameFunction(imageIds: string[]) {
  const viewport = engine.getViewport('ct');
  const volumeId = 'cornerstoneStreamingImageVolume:B';
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  volume.load();
  displaySetRegistry.add(volumeId, {
    imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({ displaySetId: volumeId });
}
