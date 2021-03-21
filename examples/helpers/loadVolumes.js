import { cache } from './../../src/index';

export default function loadVolumes(
  loadedCallback = () => {},
  loadAndRenderVolumeUIDs = [],
  backgroundLoadUIDs = []
) {
  // As we have reset layout, remove all image load handlers and start again.
  imageCache.cancelLoadAllVolumes();

  const numToLoadOnScreen = loadAndRenderVolumeUIDs.length;
  let numLoaded = 0;

  const volumeLoadedCallback = () => {
    numLoaded++;

    if (numLoaded === numToLoadOnScreen) {
      loadedCallback();
    }
  };

  for (let i = 0; i < numToLoadOnScreen; i++) {
    const volumeUID = loadAndRenderVolumeUIDs[i];
    loadSingleVolume(volumeUID, volumeLoadedCallback);
  }

  // Continue loading these volumes in the background
  backgroundLoadUIDs.forEach((volumeUID) => {
    imageCache.loadVolume(volumeUID);
  });
}

function loadSingleVolume(volumeUID, volumeLoadedCallback) {
  imageCache.loadVolume(volumeUID, (event) => {
    if (event.framesProcessed === event.numFrames) {
      volumeLoadedCallback();
    }
  });
}
