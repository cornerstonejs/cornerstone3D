import cache from './cache';
import { prefetchImageIds } from './helpers';

export default function loadVolume(volumeUID, callback) {
  const volume = cache.get(volumeUID);

  if (!volume) {
    throw new Error(
      `Cannot load volume: volume with UID ${volumeUID} does not exist.`
    );
  }

  const { imageIds, loadStatus } = volume;

  volume.loadStatus.callbacks.push(callback);

  if (loadStatus.loading) {
    return; // Already loading, will get callbacks from main load.
  }

  // TODO -> Check class later when seperated streaming and static volumes.
  if (!imageIds) {
    // Callback saying whole volume is loaded.
    callback({ success: true, framesLoaded: 1, numFrames: 1 });

    return;
  }

  const { loaded } = volume.loadStatus;
  const numFrames = imageIds.length;

  if (loaded) {
    callback({ success: true, framesLoaded: numFrames, numFrames });

    return;
  }

  prefetchImageIds(volume);
}
