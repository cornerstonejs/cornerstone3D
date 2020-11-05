import cache from './cache';
import cornerstone from 'cornerstone-core';
import { requestPoolManager } from 'cornerstone-tools';
import { getInterleavedFrames } from './helpers';

export default function loadVolume(volumeUID, callback) {
  const volume = cache.get(volumeUID);

  if (!volume) {
    throw new Error(
      `Cannot load volume: volume with UID ${volumeUID} does not exist.`
    );
  }

  const { scalarData, imageIds, loadStatus } = volume;

  // TODO -> Check class later when seperated streaming and static volumes.
  if (!imageIds) {
    // Callback saying whole volume is loaded.
    callback({ success: true, framesLoaded: 1, numFrames: 1 });

    return;
  }

  const interleavedFrames = getInterleavedFrames(imageIds);

  const { loaded, cachedFrames } = volume.loadStatus;
  const numFrames = imageIds.length;

  if (loaded) {
    callback({ success: true, framesLoaded: numFrames, numFrames });

    return;
  }

  prefetchImageIds(interleavedFrames, volume, callback);
}

const requestType = 'prefetch';
const preventCache = true; // We are not using the cornerstone cache for this.

function prefetchImageIds(interleavedFrames, volume, callback) {
  const { scalarData, loadStatus } = volume;
  const { cachedFrames } = loadStatus;
  // SharedArrayBuffer
  const buffer = scalarData.buffer;

  const numFrames = interleavedFrames.length;

  // Length of one frame in voxels
  const length = scalarData.length / numFrames;
  // Length of one frame in bytes
  const lengthInBytes = buffer.byteLength / numFrames;

  let type;

  if (scalarData instanceof Uint8Array) {
    type = 'Uint8Array';
  } else if (scalarData instanceof Float32Array) {
    type = 'Float32Array';
  } else {
    throw new Error('Unsupported array type');
  }

  let framesLoaded = 0;

  function successCallback() {
    framesLoaded++;

    if (framesLoaded === numFrames) {
      loadStatus.loaded = true;
      console.log('Loaded!');
    }

    callback({ success: true, framesLoaded, numFrames });
  }

  interleavedFrames.forEach(frame => {
    const { imageId, imageIdIndex } = frame;

    if (cachedFrames[imageIdIndex]) {
      successCallback();
    }

    const offset = imageIdIndex * lengthInBytes;

    const options = {
      targetBuffer: { buffer, offset, length, type },
    };

    // TODO -> Add options to cornerstoneTools requests via requestPoolManager
    requestPoolManager.addRequest(
      {},
      imageId,
      requestType,
      preventCache,
      () => {
        // Success
        cachedFrames[imageIdIndex] = true;
        successCallback();
      },
      error => {
        // Error
        callback({ success: false, imageId, error });
      },
      options
    );
  });

  requestPoolManager.startGrabbing();
}
