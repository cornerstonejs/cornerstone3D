import { imageCache } from './../../src/index';

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
  backgroundLoadUIDs.forEach(volumeUID => {
    imageCache.loadVolume(volumeUID);
  });
}

function loadSingleVolume(volumeUID, volumeLoadedCallback) {
  const volume = imageCache.getImageVolume(volumeUID);

  const numberOfFrames = volume.imageIds.length;

  const reRenderFraction = numberOfFrames / 50;
  let reRenderTarget = reRenderFraction;

  imageCache.loadVolume(volumeUID, event => {
    // Only call on modified every 2%.

    if (
      event.framesProcessed > reRenderTarget ||
      event.framesProcessed === event.numFrames
    ) {
      reRenderTarget += reRenderFraction;
      if (!renderingEngine.hasBeenDestroyed) {
        renderingEngine.render();
      }

      if (event.framesProcessed === event.numFrames) {
        volumeLoadedCallback();
      }
    }
  });
}
