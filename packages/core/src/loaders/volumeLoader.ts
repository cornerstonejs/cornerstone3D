import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import cloneDeep from 'lodash.clonedeep';

import { ImageVolume } from '../cache/classes/ImageVolume';
import type * as Types from '../types';
import cache from '../cache/cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';
import { uuidv4 } from '../utilities';
import { Point3, Metadata, EventTypes, Mat3 } from '../types';

interface VolumeLoaderOptions {
  imageIds: Array<string>;
}

interface DerivedVolumeOptions {
  volumeId: string;
  targetBuffer?: {
    type: 'Float32Array' | 'Uint8Array';
    sharedArrayBuffer?: boolean;
  };
}
interface LocalVolumeOptions {
  scalarData: Float32Array | Uint8Array;
  metadata: Metadata;
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
}

function createInternalVTKRepresentation({
  dimensions,
  metadata,
  spacing,
  direction,
  origin,
  scalarData,
}): vtkImageDataType {
  const { PhotometricInterpretation } = metadata;

  let numComponents = 1;
  if (PhotometricInterpretation === 'RGB') {
    numComponents = 3;
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: numComponents,
    values: scalarData,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);

  return imageData;
}

/**
 * This module deals with VolumeLoaders and loading volumes
 */

const volumeLoaders = {};

let unknownVolumeLoader;

/**
 * Load a volume using a registered Cornerstone Volume Loader.
 *
 * The volume loader that is used will be
 * determined by the volume loader scheme matching against the volumeId.
 *
 * @param volumeId - A Cornerstone Volume Object's volumeId
 * @param options - Options to be passed to the Volume Loader. Options
 * contain the ImageIds that is passed to the loader
 *
 * @returns An Object which can be used to act after a volume is loaded or loading fails
 *
 */
function loadVolumeFromVolumeLoader(
  volumeId: string,
  options: VolumeLoaderOptions
): Types.IVolumeLoadObject {
  const colonIndex = volumeId.indexOf(':');
  const scheme = volumeId.substring(0, colonIndex);
  const loader = volumeLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (unknownVolumeLoader !== undefined) {
      return unknownVolumeLoader(volumeId, options);
    }

    throw new Error(
      'loadVolumeFromVolumeLoader: no volume loader for volumeId'
    );
  }

  const volumeLoadObject = loader(volumeId, options);

  // Broadcast a volume loaded event once the image is loaded
  volumeLoadObject.promise.then(
    function (volume) {
      triggerEvent(eventTarget, Events.VOLUME_LOADED, { volume });
    },
    function (error) {
      const errorObject: EventTypes.VolumeLoadedFailedEventDetail = {
        volumeId,
        error,
      };

      triggerEvent(eventTarget, Events.VOLUME_LOADED_FAILED, errorObject);
    }
  );

  return volumeLoadObject;
}

/**
 * Loads a volume given a volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred.  The loaded image is not stored in the cache.
 *
 * @param volumeId - A Cornerstone Image Object's volumeId
 * @param options - Options to be passed to the Volume Loader
 *
 * @returns An Object which can be used to act after an image is loaded or loading fails
 */
export function loadVolume(
  volumeId: string,
  options: VolumeLoaderOptions = { imageIds: [] }
): Promise<Types.IImageVolume> {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined');
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);

  return volumeLoadObject.promise.then((volume: Types.IImageVolume) => {
    volume.imageData = createInternalVTKRepresentation(volume);
    return volume;
  });
}

/**
 * Loads an image given an volumeId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred. The image is stored in the cache.
 *
 * @param volumeId - A Cornerstone Image Object's volumeId
 * @param options - Options to be passed to the Volume Loader
 *
 * @returns Volume Loader Object
 */
export async function createAndCacheVolume(
  volumeId: string,
  options: VolumeLoaderOptions
): Promise<Record<string, any>> {
  if (volumeId === undefined) {
    throw new Error(
      'createAndCacheVolume: parameter volumeId must not be undefined'
    );
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);

  volumeLoadObject.promise.then((volume: Types.IImageVolume) => {
    volume.imageData = createInternalVTKRepresentation(volume);
  });

  cache.putVolumeLoadObject(volumeId, volumeLoadObject).catch((err) => {
    throw err;
  });

  return volumeLoadObject.promise;
}

/**
 * Based on a referencedVolumeId, it will build and cache a new volume. If
 * no scalarData is specified in the options, an empty derived volume will be
 * created that matches the image metadata of the referenceVolume. If scalarData
 * is given, it will be used to generate the intensity values for the derivedVolume.
 * Finally, it will save the volume in the cache.
 * @param referencedVolumeId - the volumeId from which the new volume will get its metadata
 * @param options - DerivedVolumeOptions {uid: derivedVolumeUID, targetBuffer: { type: FLOAT32Array | Uint8Array}, scalarData: if provided}
 *
 * @returns ImageVolume
 */
export async function createAndCacheDerivedVolume(
  referencedVolumeId: string,
  options: DerivedVolumeOptions
): Promise<ImageVolume> {
  const referencedVolume = cache.getVolume(referencedVolumeId);

  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with id ${referencedVolumeId} does not exist.`
    );
  }

  let { volumeId } = options;
  const { targetBuffer } = options;

  if (volumeId === undefined) {
    volumeId = uuidv4();
  }

  const { metadata, dimensions, spacing, origin, direction, scalarData } =
    referencedVolume;
  const scalarLength = scalarData.length;

  let numBytes, TypedArray;

  // If target buffer is provided
  if (targetBuffer) {
    if (targetBuffer.type === 'Float32Array') {
      numBytes = scalarLength * 4;
      TypedArray = Float32Array;
    } else if (targetBuffer.type === 'Uint8Array') {
      numBytes = scalarLength;
      TypedArray = Uint8Array;
    } else {
      throw new Error('TargetBuffer should be Float32Array or Uint8Array');
    }
  } else {
    // Use float32 if no targetBuffer is provided
    numBytes = scalarLength * 4;
    TypedArray = Float32Array;
  }

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  let volumeScalarData;
  if (targetBuffer?.sharedArrayBuffer) {
    const buffer = new SharedArrayBuffer(numBytes);
    volumeScalarData = new TypedArray(buffer);
  } else {
    volumeScalarData = new TypedArray(scalarLength);
  }

  // Todo: handle more than one component for segmentation (RGB)
  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: volumeScalarData,
  });

  const derivedImageData = vtkImageData.newInstance();

  derivedImageData.setDimensions(dimensions);
  derivedImageData.setSpacing(spacing);
  derivedImageData.setDirection(direction);
  derivedImageData.setOrigin(origin);
  derivedImageData.getPointData().setScalars(scalarArray);

  const derivedVolume = new ImageVolume({
    volumeId,
    metadata: cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    imageData: derivedImageData,
    scalarData: volumeScalarData,
    sizeInBytes: numBytes,
    referencedVolumeId,
  });

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  };

  await cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return derivedVolume;
}

/**
 * Creates and cache a volume based on a set of provided properties including
 * dimensions, spacing, origin, direction, metadata, scalarData. It should be noted that
 * scalarData should be provided for this function to work. If a volume with the same
 * Id exists in the cache it returns it immediately.
 * @param options -  { scalarData, metadata, dimensions, spacing, origin, direction }
 * @param volumeId - Id of the generated volume
 *
 * @returns ImageVolume
 */
export function createLocalVolume(
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): ImageVolume {
  const { scalarData, metadata, dimensions, spacing, origin, direction } =
    options;

  if (
    !scalarData ||
    !(scalarData instanceof Uint8Array || scalarData instanceof Float32Array)
  ) {
    throw new Error(
      'To use createLocalVolume you should pass scalarData of type Uint8Array or Float32Array'
    );
  }

  // Todo: handle default values for spacing, origin, direction if not provided
  if (volumeId === undefined) {
    volumeId = uuidv4();
  }

  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return cachedVolume as ImageVolume;
  }

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2];

  const numBytes = scalarData ? scalarData.buffer.byteLength : scalarLength * 4;

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  const scalarArray = vtkDataArray.newInstance({
    name: 'Pixels',
    numberOfComponents: 1,
    values: scalarData,
  });

  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.getPointData().setScalars(scalarArray);

  const derivedVolume = new ImageVolume({
    volumeId,
    metadata: cloneDeep(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    imageData: imageData,
    scalarData,
    sizeInBytes: numBytes,
  });

  if (preventCache) {
    return derivedVolume;
  }

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  };
  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return derivedVolume;
}

/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param scheme - The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param volumeLoader - A Cornerstone Volume Loader function
 */
export function registerVolumeLoader(
  scheme: string,
  volumeLoader: Types.VolumeLoaderFn
): void {
  volumeLoaders[scheme] = volumeLoader;
}

/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param volumeLoader - A Cornerstone Volume Loader
 *
 * @returns The previous Unknown Volume Loader
 */
export function registerUnknownVolumeLoader(
  volumeLoader: Types.VolumeLoaderFn
): Types.VolumeLoaderFn | undefined {
  const oldVolumeLoader = unknownVolumeLoader;

  unknownVolumeLoader = volumeLoader;

  return oldVolumeLoader;
}
