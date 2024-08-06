import * as NiftiReader from 'nifti-reader-js';
import { eventTarget, triggerEvent, utilities } from '@cornerstonejs/core';
import NiftiImageVolume from '../NiftiImageVolume';
import { rasToLps } from './convert';
import Events from '../enums/Events';
import { NIFTI_LOADER_SCHEME } from '../constants';
import makeVolumeMetadata from './makeVolumeMetadata';
import modalityScaleNifti from './modalityScaleNifti';

export const urlsMap = new Map();

function fetchArrayBuffer(url, onProgress, signal, onload) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    const onLoadHandler = function (e) {
      if (onload && typeof onload === 'function') {
        onload();
      }

      // Remove event listener for 'abort'
      if (signal) {
        signal.removeEventListener('abort', onAbortHandler);
      }

      resolve(xhr.response);
    };

    const onAbortHandler = () => {
      xhr.abort();

      // Remove event listener for 'load'
      xhr.removeEventListener('load', onLoadHandler);

      reject(new Error('Request aborted'));
    };

    xhr.addEventListener('load', onLoadHandler);

    if (onProgress && typeof onProgress === 'function') {
      xhr.onprogress = function (e) {
        onProgress(e.loaded, e.total);
      };
    }

    if (signal && signal.aborted) {
      xhr.abort();
      reject(new Error('Request aborted'));
    } else if (signal) {
      signal.addEventListener('abort', onAbortHandler);
    }

    xhr.send();
  });
}

export default async function fetchAndAllocateNiftiVolume(
  volumeId: string
): Promise<NiftiImageVolume> {
  // nifti volumeIds start with 'nifti:' so we need to remove that
  const niftiURL = volumeId.substring(NIFTI_LOADER_SCHEME.length + 1);

  const progress = (loaded, total) => {
    const data = { volumeId, loaded, total };
    triggerEvent(eventTarget, Events.NIFTI_VOLUME_PROGRESS, {
      data,
    });
  };

  const onLoad = () => {
    const data = { volumeId };
    triggerEvent(eventTarget, Events.NIFTI_VOLUME_LOADED, {
      data,
    });
  };

  const controller = new AbortController();
  const signal = controller.signal;

  urlsMap.set(niftiURL, { controller, loading: true });

  let niftiBuffer = (await fetchArrayBuffer(
    niftiURL,
    progress,
    signal,
    onLoad
  )) as ArrayBuffer;

  urlsMap.delete(niftiURL);

  let niftiHeader = null;
  let niftiImage = null;

  if (NiftiReader.isCompressed(niftiBuffer)) {
    niftiBuffer = NiftiReader.decompress(niftiBuffer);
  }

  if (NiftiReader.isNIFTI(niftiBuffer)) {
    niftiHeader = NiftiReader.readHeader(niftiBuffer);
    niftiImage = NiftiReader.readImage(niftiHeader, niftiBuffer);
  }

  const { scalarData, pixelRepresentation } = modalityScaleNifti(
    niftiHeader,
    niftiImage
  );
  // TODO: Comment it as no need invert data of each frame
  // invertDataPerFrame(niftiHeader.dims.slice(1, 4), scalarData);

  const { orientation, origin, spacing } = rasToLps(niftiHeader);
  const { volumeMetadata, dimensions, direction } = makeVolumeMetadata(
    niftiHeader,
    orientation,
    scalarData,
    pixelRepresentation
  );

  const voxelManager = utilities.VoxelManager.createScalarVolumeVoxelManager({
    dimensions,
    scalarData,
  });

  return new NiftiImageVolume(
    // ImageVolume properties
    {
      volumeId,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
      voxelManager,
      sizeInBytes: scalarData.byteLength,
      imageIds: [],
    },
    // Streaming properties
    {
      loadStatus: {
        loaded: false,
        loading: false,
        callbacks: [],
      },
      controller,
    }
  );
}
