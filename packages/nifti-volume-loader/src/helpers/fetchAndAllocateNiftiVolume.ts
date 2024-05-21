import * as NiftiReader from 'nifti-reader-js';
import {
  cache,
  utilities,
  Enums,
  eventTarget,
  triggerEvent,
  getShouldUseSharedArrayBuffer,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import makeVolumeMetadata from './makeVolumeMetadata';
import NiftiImageVolume from '../NiftiImageVolume';
import * as NIFTICONSTANTS from './niftiConstants';
import { invertDataPerFrame, rasToLps } from './convert';
import modalityScaleNifti from './modalityScaleNifti';
import Events from '../enums/Events';
import { NIFTI_LOADER_SCHEME } from '../constants';

const { createUint8SharedArray, createFloat32SharedArray } = utilities;

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

export const getTypedNiftiArray = (datatypeCode, niftiImageBuffer) => {
  switch (datatypeCode) {
    case NIFTICONSTANTS.NIFTI_TYPE_UINT8:
      return new Uint8Array(niftiImageBuffer);
    case NIFTICONSTANTS.NIFTI_TYPE_FLOAT32:
      return new Float32Array(niftiImageBuffer);
    case NIFTICONSTANTS.NIFTI_TYPE_INT16:
      return new Int16Array(niftiImageBuffer);
    default:
      throw new Error(`datatypeCode ${datatypeCode} is not yet supported`);
  }
};

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

  const typedNiftiArray = getTypedNiftiArray(
    niftiHeader.datatypeCode,
    niftiImage
  );

  // Convert to LPS for display in OHIF.

  const { orientation, origin, spacing } = rasToLps(niftiHeader);
  invertDataPerFrame(niftiHeader.dims.slice(1, 4), typedNiftiArray);

  modalityScaleNifti(typedNiftiArray, niftiHeader);

  const volumeMetadata = makeVolumeMetadata(
    niftiHeader,
    orientation,
    typedNiftiArray
  );

  const scanAxisNormal = vec3.create();
  vec3.set(scanAxisNormal, orientation[6], orientation[7], orientation[8]);

  const {
    BitsAllocated,
    PixelRepresentation,
    PhotometricInterpretation,
    ImageOrientationPatient,
    Columns,
    Rows,
  } = volumeMetadata;

  const rowCosineVec = vec3.fromValues(
    ImageOrientationPatient[0],
    ImageOrientationPatient[1],
    ImageOrientationPatient[2]
  );
  const colCosineVec = vec3.fromValues(
    ImageOrientationPatient[3],
    ImageOrientationPatient[4],
    ImageOrientationPatient[5]
  );

  const { dims } = niftiHeader;

  const numFrames = dims[3];

  // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
  const dimensions = <Types.Point3>[Columns, Rows, numFrames];
  const direction = new Float32Array([
    rowCosineVec[0],
    rowCosineVec[1],
    rowCosineVec[2],
    colCosineVec[0],
    colCosineVec[1],
    colCosineVec[2],
    scanAxisNormal[0],
    scanAxisNormal[1],
    scanAxisNormal[2],
  ]) as Types.Mat3;
  const signed = PixelRepresentation === 1;

  // Check if it fits in the cache before we allocate data
  // TODO Improve this when we have support for more types
  // NOTE: We use 4 bytes per voxel as we are using Float32.
  let bytesPerVoxel = 1;
  if (BitsAllocated === 16 || BitsAllocated === 32) {
    bytesPerVoxel = 4;
  }
  const sizeInBytesPerComponent =
    bytesPerVoxel * dimensions[0] * dimensions[1] * dimensions[2];

  let numComponents = 1;
  if (PhotometricInterpretation === 'RGB') {
    numComponents = 3;
  }

  const sizeInBytes = sizeInBytesPerComponent * numComponents;

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(sizeInBytes);
  if (!isCacheable) {
    throw new Error(Enums.Events.CACHE_SIZE_EXCEEDED);
  }

  cache.decacheIfNecessaryUntilBytesAvailable(sizeInBytes);

  let scalarData;
  const useSharedArrayBuffer = getShouldUseSharedArrayBuffer();
  const buffer_size = dimensions[0] * dimensions[1] * dimensions[2];

  switch (BitsAllocated) {
    case 8:
      if (signed) {
        throw new Error(
          '8 Bit signed images are not yet supported by this plugin.'
        );
      } else {
        scalarData = useSharedArrayBuffer
          ? createUint8SharedArray(buffer_size)
          : new Uint8Array(buffer_size);
      }

      break;

    case 16:
    case 32:
      scalarData = useSharedArrayBuffer
        ? createFloat32SharedArray(buffer_size)
        : new Float32Array(buffer_size);

      break;
  }

  // Set the scalar data from the nifti typed view into the SAB
  scalarData.set(typedNiftiArray);

  const niftiImageVolume = new NiftiImageVolume(
    // ImageVolume properties
    {
      volumeId,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
      sizeInBytes,
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

  return niftiImageVolume;
}
