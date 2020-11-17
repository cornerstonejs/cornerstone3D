import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import { requestPoolManager } from 'cornerstone-tools';
import getPatientWeightAndCorrectedDose from './getPatientWeightAndCorrectedDose';
import getInterleavedFrames from './getInterleavedFrames';

const throttle = cornerstoneTools.importInternal('util/throttle');

const requestType = 'prefetch';
const preventCache = true; // We are not using the cornerstone cache for this.

export default function prefetchImageIds(volume) {
  const { scalarData, loadStatus } = volume;
  const { cachedFrames } = loadStatus;

  const { imageIds, volumeMapper } = volume;

  const interleavedFrames = getInterleavedFrames(imageIds);

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

  function callLoadStatusCallback(evt) {
    loadStatus.callbacks.forEach(callback => callback(evt));
  }

  const throttledCallLoadStatusCallbacks = throttle(
    callLoadStatusCallback,
    16 // ~60 fps
  );

  function successCallback(imageIdIndex, imageId) {
    cachedFrames[imageIdIndex] = true;
    framesLoaded++;
    framesProcessed++;

    volumeMapper.setUpdatedFrame(imageIdIndex);

    if (framesProcessed === numFrames) {
      loadStatus.loaded = true;
      loadStatus.loading = false;

      callLoadStatusCallback({
        success: true,
        imageIdIndex,
        imageId,
        framesLoaded,
        framesProcessed,
        numFrames,
      });
      loadStatus.callbacks = [];
    } else {
      throttledCallLoadStatusCallbacks({
        success: true,
        imageIdIndex,
        imageId,
        framesLoaded,
        framesProcessed,
        numFrames,
      });
    }
  }

  function errorCallback(error, imageIdIndex, imageId) {
    framesProcessed++;

    if (framesProcessed === numFrames) {
      loadStatus.loaded = true;
      loadStatus.loading = false;

      callLoadStatusCallback({
        success: false,
        imageId,
        imageIdIndex,
        error,
        framesLoaded,
        framesProcessed,
        numFrames,
      });

      loadStatus.callbacks = [];
    } else {
      throttledCallLoadStatusCallbacks({
        success: false,
        imageId,
        imageIdIndex,
        error,
        framesLoaded,
        framesProcessed,
        numFrames,
      });
    }
  }

  interleavedFrames.forEach(frame => {
    const { imageId, imageIdIndex } = frame;

    if (cachedFrames[imageIdIndex]) {
      successCallback(imageIdIndex, imageId);
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
        successCallback(imageIdIndex, imageId);
      },
      error => {
        errorCallback(error, imageIdIndex, imageId);
      },
      null, // addToBeginning option, need to pass something to pass options in correct spot.
      options
    );
  });

  requestPoolManager.startGrabbing();
}
