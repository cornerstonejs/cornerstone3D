import cache from './cache';
import cornerstone from 'cornerstone-core';
import { requestPoolManager } from 'cornerstone-tools';
import { getInterleavedFrames } from './helpers';
import getPatientWeightAndCorrectedDose from './helpers/getPatientWeightAndCorrectedDose';

export default function loadVolume(volumeUID, callback) {
  const volume = cache.get(volumeUID);

  if (!volume) {
    throw new Error(
      `Cannot load volume: volume with UID ${volumeUID} does not exist.`
    );
  }

  const { scalarData, imageIds, loadStatus } = volume;

  volume.loadStatus.callbacks.push(callback);

  if (loadStatus.loading) {
    console.log('IS LOADING');
    return; // Already loading, will get callbacks from main load.
  }

  // TODO -> Check class later when seperated streaming and static volumes.
  if (!imageIds) {
    // Callback saying whole volume is loaded.
    callback({ success: true, framesLoaded: 1, numFrames: 1 });

    return;
  }

  const interleavedFrames = getInterleavedFrames(imageIds);

  const { loaded } = volume.loadStatus;
  const numFrames = imageIds.length;

  if (loaded) {
    callback({ success: true, framesLoaded: numFrames, numFrames });

    return;
  }

  prefetchImageIds(interleavedFrames, volume, callback);
}

const requestType = 'prefetch';
const preventCache = true; // We are not using the cornerstone cache for this.

function prefetchImageIds(interleavedFrames, volume) {
  const { scalarData, loadStatus } = volume;
  const { cachedFrames } = loadStatus;

  loadStatus.loading = true;

  // SharedArrayBuffer
  const arrayBuffer = scalarData.buffer;
  const numFrames = interleavedFrames.length;

  // Length of one frame in voxels
  const length = scalarData.length / numFrames;
  // Length of one frame in bytes
  const lengthInBytes = arrayBuffer.byteLength / numFrames;

  let type;

  if (scalarData instanceof Uint8Array) {
    type = 'Uint8Array';
  } else if (scalarData instanceof Float32Array) {
    type = 'Float32Array';
  } else {
    throw new Error('Unsupported array type');
  }

  let framesLoaded = 0;
  let framesProcessed = 0;

  function successCallback(imageIdIndex) {
    cachedFrames[imageIdIndex] = true;
    framesLoaded++;
    framesProcessed++;

    loadStatus.callbacks.forEach(callback =>
      callback({ success: true, framesLoaded, numFrames })
    );

    if (framesProcessed === numFrames) {
      loadStatus.loaded = true;
      loadStatus.loading = false;
      loadStatus.callbacks = [];
    }
  }

  function errorCallback(error, imageId) {
    framesProcessed++;

    loadStatus.callbacks.forEach(callback =>
      callback({ success: false, imageId, error })
    );

    if (framesProcessed === numFrames) {
      loadStatus.loaded = true;
      loadStatus.loading = false;
      loadStatus.callbacks = [];
    }
  }

  interleavedFrames.forEach(frame => {
    const { imageId, imageIdIndex } = frame;

    if (cachedFrames[imageIdIndex]) {
      successCallback();
    }

    const modalityLutModule =
      cornerstone.metaData.get('modalityLutModule', imageId) || {};

    const generalSeriesModule =
      cornerstone.metaData.get('generalSeriesModule', imageId) || {};

    const scalingParameters = {
      rescaleSlope: modalityLutModule.rescaleSlope,
      rescaleIntercept: modalityLutModule.rescaleIntercept,
      modality: generalSeriesModule.modality,
    };

    if (scalingParameters.modality === 'PT') {
      const { patientWeight, correctedDose } = getPatientWeightAndCorrectedDose(
        imageId
      );

      scalingParameters.patientWeight = patientWeight;
      scalingParameters.correctedDose = correctedDose;
    }

    const options = {
      targetBuffer: {
        arrayBuffer,
        offset: imageIdIndex * lengthInBytes,
        length,
        type,
      },
      preScale: {
        scalingParameters,
      },
    };

    // TODO -> Add options to cornerstoneTools requests via requestPoolManager
    requestPoolManager.addRequest(
      {},
      imageId,
      requestType,
      preventCache,
      () => {
        successCallback(imageIdIndex);
      },
      error => {
        errorCallback(error, imageId);
      },
      null, // addToBeginning option, need to pass something to pass options in correct spot.
      options
    );
  });

  requestPoolManager.startGrabbing();
}
