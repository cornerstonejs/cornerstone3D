import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import cloneDeep from 'lodash.clonedeep';

import { ImageVolume } from '../cache/classes/ImageVolume';
import cache from '../cache/cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';
import {
  generateVolumePropsFromImageIds,
  getBufferConfiguration,
  uuidv4,
} from '../utilities';
import {
  Point3,
  Metadata,
  EventTypes,
  Mat3,
  IImageVolume,
  VolumeLoaderFn,
  IDynamicImageVolume,
  PixelDataTypedArray,
  IVolumeLoadObject,
  PixelDataTypedArrayString,
} from '../types';
import { getConfiguration } from '../init';
import {
  performCacheOptimizationForVolume,
  setupCacheOptimizationEventListener,
} from '../utilities/cacheUtils';

interface VolumeLoaderOptions {
  imageIds: Array<string>;
}

interface DerivedVolumeOptions {
  volumeId: string;
  targetBuffer?: {
    type: PixelDataTypedArrayString;
    sharedArrayBuffer?: boolean;
  };
}
interface LocalVolumeOptions {
  scalarData: PixelDataTypedArray;
  metadata: Metadata;
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
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
  volume: IImageVolume
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
    const scalarDataArrays = (<IDynamicImageVolume>(
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
): IVolumeLoadObject {
  const colonIndex = volumeId.indexOf(':');
  const scheme = volumeId.substring(0, colonIndex);
  let loader = volumeLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (
      unknownVolumeLoader == null ||
      typeof unknownVolumeLoader !== 'function'
    ) {
      throw new Error(
        `No volume loader for scheme ${scheme} has been registered`
      );
    }

    loader = unknownVolumeLoader;
  }

  const volumeLoadObject = loader(volumeId, options);

  setupCacheOptimizationEventListener(volumeId);

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
): Promise<IImageVolume> {
  if (volumeId === undefined) {
    throw new Error('loadVolume: parameter volumeId must not be undefined');
  }

  let volumeLoadObject = cache.getVolumeLoadObject(volumeId);

  if (volumeLoadObject !== undefined) {
    return volumeLoadObject.promise;
  }

  volumeLoadObject = loadVolumeFromVolumeLoader(volumeId, options);

  return volumeLoadObject.promise.then((volume: IImageVolume) => {
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

  volumeLoadObject.promise.then((volume: IImageVolume) => {
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
): Promise<IImageVolume> {
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
    imageIds: [],
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
): IImageVolume {
  const { scalarData, metadata, dimensions, spacing, origin, direction } =
    options;

  if (
    !scalarData ||
    !(
      scalarData instanceof Uint8Array ||
      scalarData instanceof Float32Array ||
      scalarData instanceof Uint16Array ||
      scalarData instanceof Int16Array
    )
  ) {
    throw new Error(
      'To use createLocalVolume you should pass scalarData of type Uint8Array, Uint16Array, Int16Array or Float32Array'
    );
  }

  // Todo: handle default values for spacing, origin, direction if not provided
  if (volumeId === undefined) {
    volumeId = uuidv4();
  }

  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return cachedVolume as IImageVolume;
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
    imageIds: [],
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

export async function createAndCacheVolumeFromImages(
  volumeId: string,
  imageIds: string[],
  options: {
    preventCache?: boolean;
    additionalDetails?: Record<string, any>;
  } = {}
): Promise<IImageVolume> {
  const { preventCache = false } = options;

  if (imageIds === undefined) {
    throw new Error(
      'createAndCacheVolumeFromImages: parameter imageIds must not be undefined'
    );
  }

  if (volumeId === undefined) {
    throw new Error(
      'createAndCacheVolumeFromImages: parameter volumeId must not be undefined'
    );
  }

  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return Promise.resolve(cachedVolume);
  }

  const volumeProps = generateVolumePropsFromImageIds(imageIds, volumeId);

  // volume is an empty volume, we need to load the data from the imageIds
  // into the volume scalarData

  // it is important to get the imageIds from the volumeProps
  // since they are sorted
  const imagePromises = volumeProps.imageIds.map((imageId, imageIdIndex) => {
    const imageLoadObject = cache.getImageLoadObject(imageId);

    return imageLoadObject.promise.then((image) => {
      const pixelData = image.getPixelData();
      const offset = imageIdIndex * image.rows * image.columns;

      (volumeProps.scalarData as PixelDataTypedArray).set(pixelData, offset);
    });
  });

  await Promise.all(imagePromises);

  const volume = new ImageVolume({
    ...volumeProps,
    referencedImageIds: imageIds,
    ...options,
  });

  // since we generated the volume from images, we can optimize the cache
  // by replacing the pixelData of the images with a view of the volume's
  // scalarData
  performCacheOptimizationForVolume(volume);

  const volumeLoadObject = {
    promise: Promise.resolve(volume),
  };

  if (preventCache) {
    return volumeLoadObject.promise;
  }

  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  return volumeLoadObject.promise;
}

/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param scheme - The scheme to use for this volume loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param volumeLoader - A Cornerstone Volume Loader function
 */
export function registerVolumeLoader(
  scheme: string,
  volumeLoader: VolumeLoaderFn
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
  volumeLoader: VolumeLoaderFn
): VolumeLoaderFn | undefined {
  const oldVolumeLoader = unknownVolumeLoader;

  unknownVolumeLoader = volumeLoader;

  return oldVolumeLoader;
}

export function getUnknownVolumeLoaderSchema(): string {
  return unknownVolumeLoader.name;
}

/**
 * Creates and caches a derived segmentation volume based on a referenced volume.
 * This is basically a utility method since for the segmentations we have to specify
 * Uint8Array as the targetBuffer type for now until we support other types.
 *
 * @param referencedVolumeId - The ID of the referenced volume.
 * @param options - The options for creating the derived volume.
 * @returns A promise that resolves to the created derived segmentation volume.
 */
export async function createAndCacheDerivedSegmentationVolume(
  referencedVolumeId: string,
  options = {} as DerivedVolumeOptions
): Promise<IImageVolume> {
  return createAndCacheDerivedVolume(referencedVolumeId, {
    ...options,
    targetBuffer: {
      type: 'Uint8Array',
    },
  });
}
