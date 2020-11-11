import { requestPoolManager } from 'cornerstone-tools';
import cache from './cache';
import { prefetchImageIds } from './helpers';

const requestType = 'prefetch';

export default function cancelLoadVolume(volumeUID) {
  const volume = cache.get(volumeUID);

  if (!volume) {
    throw new Error(
      `Cannot load volume: volume with UID ${volumeUID} does not exist.`
    );
  }

  const { imageIds, loadStatus } = volume;

  if (!loadStatus || !loadStatus.loading) {
    return;
  }

  // Set to not loading.
  loadStatus.loading = false;

  // Set to loaded if any data is missing.
  loadStatus.loaded = _hasLoaded(loadStatus, imageIds.length);
  // Remove all the callback listeners
  loadStatus.callbacks = [];

  // TODO -> Remove requests relating to this volume only.

  requestPoolManager.clearRequestStack(requestType);

  // Get other volumes and if they are loading re-add their status

  const iterator = cache.values();

  /* eslint-disable no-constant-condition */
  while (true) {
    const { value: volume, done } = iterator.next();

    if (done) {
      break;
    }

    if (
      volume.uid !== volumeUID &&
      volume.loadStatus &&
      volume.loadStatus.loading === true
    ) {
      // Other volume still loading. Add to prefetcher.
      prefetchImageIds(volume);
    }
  }
}

/**
 * If any frame has not yet loaded, return false.
 *
 * @param {object} loadStatus - The loadStatus object of the volume.
 * @returns {boolean}
 */
function _hasLoaded(loadStatus, numFrames) {
  for (let i = 0; i < numFrames; i++) {
    if (!loadStatus.cachedFrames[i]) {
      return false;
    }
  }

  return true;
}
