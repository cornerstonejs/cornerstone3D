import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import { requestPoolManager } from 'cornerstone-tools';
// @ts-ignore
import getPatientWeightAndCorrectedDose from './getPatientWeightAndCorrectedDose.ts';
// @ts-ignore
import getInterleavedFrames from './getInterleavedFrames.ts';
// @ts-ignore
import StreamingImageVolume from '../classes/StreamingImageVolume.ts';

const requestType = 'prefetch';
const preventCache = true; // We are not using the cornerstone cache for this.

type ScalingParamaters = {
  rescaleSlope: number;
  rescaleIntercept: number;
  modality: string;
  patientWeight?: number;
  correctedDose?: number;
};

export default function prefetchImageIds(volume: StreamingImageVolume) {
  const { scalarData, loadStatus } = volume;
  const { cachedFrames } = loadStatus;

  const { imageIds, vtkOpenGLTexture, vtkImageData } = volume;

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

  function successCallback(imageIdIndex, imageId) {
    cachedFrames[imageIdIndex] = true;
    framesLoaded++;
    framesProcessed++;

    vtkOpenGLTexture.setUpdatedFrame(imageIdIndex);
    vtkImageData.modified();

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
      callLoadStatusCallback({
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
      callLoadStatusCallback({
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
      framesLoaded++;
      framesProcessed++;
      return;
    }

    const modalityLutModule =
      cornerstone.metaData.get('modalityLutModule', imageId) || {};

    const generalSeriesModule =
      cornerstone.metaData.get('generalSeriesModule', imageId) || {};

    const scalingParameters: ScalingParamaters = {
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
