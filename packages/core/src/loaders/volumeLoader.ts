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
import { getBufferConfiguration, uuidv4 } from '../utilities';
import {
  Point3,
  Metadata,
  EventTypes,
  Mat3,
  PixelDataTypedArray,
  PixelDataTypedArrayString,
} from '../types';
import { getConfiguration } from '../init';
import { Volume } from '../cache';
import { performCacheOptimizationForVolume } from '../utilities/cacheUtils';

interface VolumeLoaderOptions {
  imageIds: Array<string>;
  /** Optionally using the imageIds from a referenced volume */
  referencedImageIds?: Array<string>;
}

interface DerivedVolumeOptions {
  volumeId: string;
  targetBuffer?: {
    type: PixelDataTypedArrayString;
    sharedArrayBuffer?: boolean;
  };
}
interface LocalVolumeOptions {
  scalarData: PixelDataTypedArray | PixelDataTypedArray[];
  metadata: Metadata;
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
  imageIds?: string[];
}

/**
 * Adds a single scalar data to a 3D volume
 */
function addScalarDataToImageData(
  imageData: vtkImageDataType,
  scalarData: PixelDataTypedArray,
  dataArrayAttrs
) {
  const scalarArray = vtkDataArray.newInstance({
    name: `Pixels`,
    values: scalarData,
    ...dataArrayAttrs,
  });

  imageData.getPointData().setScalars(scalarArray);
}

/**
 * Adds multiple scalar data (time points) to a 4D volume
 */
function addScalarDataArraysToImageData(
  imageData: vtkImageDataType,
  scalarDataArrays: PixelDataTypedArray[],
  dataArrayAttrs
) {
  scalarDataArrays.forEach((scalarData, i) => {
    const vtkScalarArray = vtkDataArray.newInstance({
      name: `timePoint-${i}`,
      values: scalarData,
      ...dataArrayAttrs,
    });

    imageData.getPointData().addArray(vtkScalarArray);
  });

  // Set the first as active otherwise nothing is displayed on the screen
  imageData.getPointData().setActiveScalars('timePoint-0');
}

function createInternalVTKRepresentation(
  volume: Types.IVolume
): vtkImageDataType {
  const { dimensions, metadata, spacing, direction, origin } = volume;
  const { PhotometricInterpretation } = metadata;

  let numComponents = 1;
  if (PhotometricInterpretation === 'RGB') {
    numComponents = 3;
  }

  const imageData = vtkImageData.newInstance();
  const dataArrayAttrs = { numberOfComponents: numComponents };

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);

  // Add scalar data to 3D or 4D volume
  if (volume.isDynamicVolume()) {
    const scalarDataArrays = (<Types.IDynamicImageVolume>(
      volume
    )).getScalarDataArrays();

    addScalarDataArraysToImageData(imageData, scalarDataArrays, dataArrayAttrs);
  } else {
    const scalarData = volume.getScalarData();

    addScalarDataToImageData(imageData, scalarData, dataArrayAttrs);
  }

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
  options?: VolumeLoaderOptions
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

  performCacheOptimizationForVolume(volumeId);

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
): Promise<Types.IVolume> {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined');
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);

  return volumeLoadObject.promise.then((volume: Types.IVolume) => {
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
  options?: VolumeLoaderOptions
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

  volumeLoadObject.promise.then((volume: Types.IVolume) => {
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
 * @param options - DerivedVolumeOptions {uid: derivedVolumeUID, targetBuffer: { type: Float32Array | Uint8Array |
 * Uint16Array | Uint32Array  }, scalarData: if provided}
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

  const { metadata, dimensions, spacing, origin, direction } = referencedVolume;
  const scalarData = referencedVolume.getScalarData();
  const scalarLength = scalarData.length;

  const { useNorm16Texture } = getConfiguration().rendering;

  // If target buffer is provided
  const { TypedArrayConstructor, numBytes } = getBufferConfiguration(
    targetBuffer?.type,
    scalarLength,
    {
      use16BitTexture: useNorm16Texture,
      isVolumeBuffer: true,
    }
  );

  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  let volumeScalarData;
  if (targetBuffer?.sharedArrayBuffer) {
    const buffer = new SharedArrayBuffer(numBytes);
    volumeScalarData = new TypedArrayConstructor(buffer);
  } else {
    volumeScalarData = new TypedArrayConstructor(scalarLength);
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

  // const imageIds = referencedVolume.imageIds.map((imageId) => {
  //   return `derived: ${imageId}`;
  // });

  const derivedVolume = new Volume({
    // imageIds,
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

function createVolumeBase(
  options: LocalVolumeOptions,
  volumeId: string
): { volumeProps: Types.VolumeProps; numBytes: number } {
  const { scalarData, metadata, dimensions, spacing, origin, direction } =
    options;

  if (!scalarData) {
    throw new Error(
      'To use createLocalVolume you should pass scalarData of a valid typed array'
    );
  }

  if (scalarData.length > 0) {
    throw new Error('Currently createLocalVolume only supports 3D volumes. ');
  }

  if (volumeId === undefined) {
    volumeId = uuidv4();
  }

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2];
  const numBytes =
    (scalarData as PixelDataTypedArray).buffer.byteLength || scalarLength * 4;

  if (!cache.isCacheable(numBytes)) {
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

  return {
    volumeProps: {
      volumeId,
      metadata: cloneDeep(metadata),
      dimensions,
      spacing,
      origin,
      direction,
      imageData,
      scalarData,
      sizeInBytes: numBytes,
    },
    numBytes,
  };
}

export function createAndCacheLocalVolume(
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): Types.IVolume {
  const cachedVolume = cache.getVolume(volumeId);
  if (cachedVolume) {
    return cachedVolume;
  }

  const { volumeProps, numBytes } = createVolumeBase(options, volumeId);
  // check if there is enough space in unallocated + image Cache
  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  const derivedVolume = new Volume(volumeProps);

  if (preventCache) {
    return derivedVolume;
  }

  const volumeLoadObject = { promise: Promise.resolve(derivedVolume) };
  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return derivedVolume as Volume;
}

export function createAndCacheLocalImageVolume(
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): ImageVolume {
  const cachedVolume = cache.getVolume(volumeId) as ImageVolume;
  if (cachedVolume) {
    return cachedVolume;
  }

  const { volumeProps, numBytes } = createVolumeBase(options, volumeId);

  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  const derivedVolume = new ImageVolume({
    ...volumeProps,
    imageIds: options.imageIds || [],
  });

  if (preventCache || numBytes === 0) {
    return derivedVolume as ImageVolume;
  }

  const volumeLoadObject = { promise: Promise.resolve(derivedVolume) };
  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return derivedVolume as ImageVolume;
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

/** Gets the array of volume loader schemes */
export function getVolumeLoaderSchemes(): string[] {
  return Object.keys(volumeLoaders);
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

export function getUnknownVolumeLoaderSchema(): string {
  return unknownVolumeLoader.name;
}
