// @ts-ignore
import ImageVolume from './classes/ImageVolume.ts';
// @ts-ignore
import StreamingImageVolume from './classes/StreamingImageVolume.ts';
import { requestPoolManager } from 'cornerstone-tools';
import { prefetchImageIds } from './helpers';
import { vec3 } from 'gl-matrix';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import {
  createUint8SharedArray,
  createFloat32SharedArray,
} from '../sharedArrayBufferHelpers';

import { makeVolumeMetadata, sortImageIdsAndGetSpacing } from './helpers';
import { uuidv4 } from '../utils';
import errorCodes from '../errorCodes';
import _cloneDeep from 'lodash.clonedeep';

const MAX_CACHE_SIZE_1GB = 1073741824;
const REQUEST_TYPE = 'prefetch';

class ImageCache {
  private _cache: Map<string, ImageVolume>;
  private _cacheSize: number;
  private _maxCacheSize: number;

  constructor() {
    this._cache = new Map();
    this._cacheSize = 0;
    this._maxCacheSize = MAX_CACHE_SIZE_1GB; // Default 1GB
  }

  public getImageVolume = (uid: string): ImageVolume | StreamingImageVolume => {
    return this._get(uid);
  };

  public setMaxCacheSize = (newMaxCacheSize: number) => {
    this._maxCacheSize = newMaxCacheSize;

    if (this._maxCacheSize > this._cacheSize) {
      const errorMessage = `New max cacheSize ${this._maxCacheSize} larger than current cachesize ${this._cacheSize}. You should set the maxCacheSize before adding data to the cache.`;
      throw new Error(errorMessage);
    }
  };

  public getMaxCacheSize = (): number => {
    return this._maxCacheSize;
  };

  public getCacheSize = (): number => {
    return this._cacheSize;
  };

  public decacheVolume = (uid: string) => {
    const volume = this._get(uid);

    this.cancelLoadVolume(uid);

    // Clear texture memory (it will probably only be released at garbage collection of the dom element, but might as well try)
    // TODO We need to actually check if this particular scalar is used.
    volume.vtkOpenGLTexture.releaseGraphicsResources();

    this._delete(uid);
  };

  public loadVolume = (volumeUID: string, callback: Function) => {
    const volume = this._get(volumeUID);

    if (!volume) {
      throw new Error(
        `Cannot load volume: volume with UID ${volumeUID} does not exist.`
      );
    }

    if (!(volume instanceof StreamingImageVolume)) {
      // Callback saying whole volume is loaded.
      callback({ success: true, framesLoaded: 1, numFrames: 1 });

      return;
    }

    const streamingVolume = <StreamingImageVolume>volume;

    const { imageIds, loadStatus } = streamingVolume;

    streamingVolume.loadStatus.callbacks.push(callback);

    if (loadStatus.loading) {
      return; // Already loading, will get callbacks from main load.
    }

    const { loaded } = streamingVolume.loadStatus;
    const numFrames = imageIds.length;

    if (loaded) {
      callback({ success: true, framesLoaded: numFrames, numFrames });

      return;
    }

    prefetchImageIds(streamingVolume);
  };

  public cancelLoadVolume = (volumeUID: string) => {
    const volume = this._get(volumeUID);

    if (!volume) {
      throw new Error(
        `Cannot load volume: volume with UID ${volumeUID} does not exist.`
      );
    }

    if (!(volume instanceof StreamingImageVolume)) {
      return;
    }

    const streamingVolume = <StreamingImageVolume>volume;

    const { imageIds, loadStatus } = streamingVolume;

    if (!loadStatus || !loadStatus.loading) {
      return;
    }

    // Set to not loading.
    loadStatus.loading = false;

    // Set to loaded if any data is missing.
    loadStatus.loaded = this._hasLoaded(loadStatus, imageIds.length);
    // Remove all the callback listeners
    loadStatus.callbacks = [];

    // Remove requests relating to this volume only.
    requestPoolManager.clearRequestStack(REQUEST_TYPE);

    // Get other volumes and if they are loading re-add their status
    const iterator = this._cache.values();

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
  };

  public makeAndCacheImageVolume = (imageIds: Array<string>, uid: string) => {
    if (uid === undefined) {
      uid = uuidv4();
    }

    const cachedVolume = this._get(uid);

    if (cachedVolume) {
      return cachedVolume;
    }

    const volumeMetadata = makeVolumeMetadata(imageIds);

    const {
      BitsAllocated,
      PixelRepresentation,
      ImageOrientationPatient,
      PixelSpacing,
      Columns,
      Rows,
    } = volumeMetadata;

    const rowCosineVec = vec3.fromValues(
      ...ImageOrientationPatient.slice(0, 3)
    );
    const colCosineVec = vec3.fromValues(
      ...ImageOrientationPatient.slice(3, 6)
    );
    const scanAxisNormal = vec3.cross([], rowCosineVec, colCosineVec);

    const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
      imageIds,
      scanAxisNormal
    );

    const numFrames = imageIds.length;

    // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
    const spacing = [PixelSpacing[1], PixelSpacing[0], zSpacing];
    const dimensions = [Columns, Rows, numFrames];
    const direction = [...rowCosineVec, ...colCosineVec, ...scanAxisNormal];
    const signed = PixelRepresentation === 1;

    // Check if it fits in the cache before we allocate data
    const currentCacheSize = this.getCacheSize();

    // TODO Improve this when we have support for more types
    const bytesPerVoxel = BitsAllocated === 16 ? 4 : 1;

    const byteLength =
      bytesPerVoxel * dimensions[0] * dimensions[1] * dimensions[2];

    if (currentCacheSize + byteLength > this.getMaxCacheSize()) {
      throw new Error(errorCodes.CACHE_SIZE_EXCEEDED);
    }

    let scalarData;

    switch (BitsAllocated) {
      case 8:
        if (signed) {
          throw new Error(
            '8 Bit signed images are not yet supported by this plugin.'
          );
        } else {
          scalarData = createUint8SharedArray(
            dimensions[0] * dimensions[1] * dimensions[2]
          );
        }

        break;

      case 16:
        scalarData = createFloat32SharedArray(
          dimensions[0] * dimensions[1] * dimensions[2]
        );

        break;
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values: scalarData,
    });

    const imageData = vtkImageData.newInstance();

    imageData.setDimensions(...dimensions);
    imageData.setSpacing(...spacing);
    imageData.setDirection(...direction);
    imageData.setOrigin(...origin);
    imageData.getPointData().setScalars(scalarArray);

    const streamingImageVolume = new StreamingImageVolume(
      // ImageVolume properties
      {
        uid,
        metadata: volumeMetadata,
        dimensions,
        spacing,
        origin,
        direction,
        vtkImageData: imageData,
        scalarData,
      },
      // Streaming properties
      {
        imageIds: sortedImageIds,
        loadStatus: {
          loaded: false,
          loading: false,
          cachedFrames: [],
          callbacks: [],
        },
      }
    );

    this._set(uid, streamingImageVolume);

    return streamingImageVolume;
  };

  public makeAndCacheDerivedVolume = (
    referencedVolumeUID,
    options: any = {}
  ) => {
    const referencedVolume = this._get(referencedVolumeUID);

    if (!referencedVolume) {
      throw new Error(
        `Cannot created derived volume: Referenced volume with UID ${referencedVolumeUID} does not exist.`
      );
    }

    let { volumeScalarData, uid } = options;

    if (uid === undefined) {
      uid = uuidv4();
    }

    const {
      metadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
    } = referencedVolume;

    const scalarLength = scalarData.length;

    // Check if it fits in the cache before we allocate data
    const currentCacheSize = this.getCacheSize();

    let byteLength;

    if (volumeScalarData) {
      byteLength = volumeScalarData.buffer.byteLength;
    } else {
      byteLength = scalarLength * 4;
    }

    if (currentCacheSize + byteLength > this.getMaxCacheSize()) {
      throw new Error(errorCodes.CACHE_SIZE_EXCEEDED);
    }

    if (volumeScalarData) {
      if (volumeScalarData.length !== scalarLength) {
        throw new Error(
          `volumeScalarData has incorrect length compared to source data. Length: ${volumeScalarData.length}, expected:scalarLength`
        );
      }

      if (
        !(volumeScalarData instanceof Uint8Array) &&
        !(volumeScalarData instanceof Float32Array)
      ) {
        throw new Error(
          `volumeScalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
        );
      }
    } else {
      volumeScalarData = new Float32Array(scalarLength);
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values: volumeScalarData,
    });

    const derivedImageData = vtkImageData.newInstance();

    derivedImageData.setDimensions(...dimensions);
    derivedImageData.setSpacing(...spacing);
    derivedImageData.setDirection(...direction);
    derivedImageData.setOrigin(...origin);
    derivedImageData.getPointData().setScalars(scalarArray);

    const derivedVolume = new ImageVolume({
      uid,
      metadata: _cloneDeep(metadata),
      dimensions: [...dimensions],
      spacing: [...spacing],
      origin: [...spacing],
      direction: [...direction],
      vtkImageData: derivedImageData,
      scalarData: volumeScalarData,
    });

    this._set(uid, derivedVolume);

    return derivedVolume;
  };

  public makeAndCacheLocalImageVolume = (properties: any = {}, uid: string) => {
    if (uid === undefined) {
      uid = uuidv4();
    }

    const cachedVolume = this._get(uid);

    if (cachedVolume) {
      return cachedVolume;
    }

    let {
      metadata,
      dimensions,
      spacing,
      origin,
      direction,
      scalarData,
    } = properties;

    const scalarLength = dimensions[0] * dimensions[1] * dimensions[2];

    // Check if it fits in the cache before we allocate data
    const currentCacheSize = this.getCacheSize();

    const byteLength = scalarData
      ? scalarData.buffer.byteLength
      : scalarLength * 4;

    if (currentCacheSize + byteLength > this.getMaxCacheSize()) {
      throw new Error(errorCodes.CACHE_SIZE_EXCEEDED);
    }

    if (scalarData) {
      if (
        !(scalarData instanceof Uint8Array) &&
        !(scalarData instanceof Float32Array)
      ) {
        throw new Error(
          `scalarData is not a Uint8Array or Float32Array, other array types currently unsupported.`
        );
      }
    } else {
      scalarData = new Float32Array(scalarLength);
    }

    const scalarArray = vtkDataArray.newInstance({
      name: 'Pixels',
      numberOfComponents: 1,
      values: scalarData,
    });

    const imageData = vtkImageData.newInstance();

    imageData.setDimensions(...dimensions);
    imageData.setSpacing(...spacing);
    imageData.setDirection(...direction);
    imageData.setOrigin(...origin);
    imageData.getPointData().setScalars(scalarArray);

    const volume = new ImageVolume({
      uid,
      metadata,
      dimensions,
      spacing,
      origin,
      direction,
      vtkImageData: imageData,
      scalarData: scalarData,
    });

    this._set(uid, volume);

    return volume;
  };

  public purgeCache = () => {
    const iterator = this._cache.values();

    /* eslint-disable no-constant-condition */
    while (true) {
      const { value: volume, done } = iterator.next();

      if (done) {
        break;
      }

      this.decacheVolume(volume.uid);
    }
  };

  private _get = (uid: string): ImageVolume | StreamingImageVolume => {
    return this._cache.get(uid);
  };

  private _set = (uid: string, volume: ImageVolume | StreamingImageVolume) => {
    this._cache.set(uid, volume);

    const increment = volume.scalarData.buffer.byteLength;

    this._incrementCacheSize(increment);
  };

  private _delete = (uid: string) => {
    const volume = this._cache.get(uid);
    const byteLength = volume.scalarData.byteLength;
    const increment = -byteLength;

    this._cache.delete(uid);
    this._incrementCacheSize(increment);
  };

  private _incrementCacheSize = (increment: number) => {
    this._cacheSize += increment;
  };

  private _hasLoaded = (loadStatus, numFrames) => {
    for (let i = 0; i < numFrames; i++) {
      if (!loadStatus.cachedFrames[i]) {
        return false;
      }
    }

    return true;
  };
}

export default new ImageCache();
