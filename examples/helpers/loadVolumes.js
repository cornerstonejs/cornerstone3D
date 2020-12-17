import { imageCache } from './../../src/index';

export default function loadVolumes(
  loadedCallback = () => {},
  loadAndRenderVolumeUIDs = [],
  backgroundLoadUIDs = [],
  renderingEngine
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
    loadSingleVolume(volumeUID, volumeLoadedCallback, renderingEngine);
  }

  // Continue loading these volumes in the background
  backgroundLoadUIDs.forEach(volumeUID => {
    imageCache.loadVolume(volumeUID);
  });
}

function loadSingleVolume(volumeUID, volumeLoadedCallback, renderingEngine) {
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
        const scenesUIDs = [];

        renderingEngine.getScenes().forEach(scene => {
          debugger;

          const sceneContainsVolume = scene.getVolumeActors().some(va => {
            return va.uid === volumeUID;
          });

          if (sceneContainsVolume) {
            scenesUIDs.push(scene.uid);
          }
        });

        if (scenesUIDs.length) {
          renderingEngine.renderScenes(scenesUIDs);
        }
      }

      if (event.framesProcessed === event.numFrames) {
        volumeLoadedCallback();
      }
    }
  });
}
