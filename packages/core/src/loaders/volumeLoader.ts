import '@kitware/vtk.js/Rendering/Profiles/Volume';

import { ImageVolume } from '../cache/classes/ImageVolume';
import cache from '../cache/cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';

import uuidv4 from '../utilities/uuidv4';
import VoxelManager from '../utilities/VoxelManager';
import type {
  Point3,
  Metadata,
  EventTypes,
  Mat3,
  IImageVolume,
  VolumeLoaderFn,
  PixelDataTypedArray,
  IVolumeLoadObject,
  PixelDataTypedArrayString,
} from '../types';
import {
  createAndCacheLocalImage,
  createAndCacheDerivedImages,
} from './imageLoader';

interface VolumeLoaderOptions {
  imageIds: string[];
  progressiveRendering?: boolean;
}

interface DerivedVolumeOptions {
  volumeId: string;
  targetBufferType?: PixelDataTypedArrayString;
}

export interface LocalVolumeOptions {
  metadata: Metadata;
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
  scalarData?: PixelDataTypedArray;
  imageIds?: string[];
  referencedImageIds?: string[];
  referencedVolumeId?: string;
  preventCache?: boolean;
  targetBufferType?: PixelDataTypedArrayString;
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
): Promise<IImageVolume> {
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

  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

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
export function createAndCacheDerivedVolume(
  referencedVolumeId: string,
  options: DerivedVolumeOptions
): IImageVolume {
  const referencedVolume = cache.getVolume(referencedVolumeId);
  if (!referencedVolume) {
    throw new Error(
      `Cannot created derived volume: Referenced volume with id ${referencedVolumeId} does not exist.`
    );
  }

  let { volumeId } = options;

  if (volumeId === undefined) {
    volumeId = uuidv4();
  }

  const { metadata, dimensions, spacing, origin, direction } = referencedVolume;

  const referencedImageIds = referencedVolume.imageIds ?? [];

  // Todo: fix later
  // const byteLength = referencedImageIds.reduce((total, imageId) => {
  //   const image = cache.getImage(imageId);
  //   return total + image.sizeInBytes;
  // }, 0);

  // const isCacheable = cache.isCacheable(byteLength);

  // if (!isCacheable) {
  //   throw new Error(
  //     `Cannot created derived volume: Referenced volume with id ${referencedVolumeId} does not exist.`
  //   );
  // }

  // put the imageIds into the cache synchronously since they are just empty
  // images
  const derivedImages = createAndCacheDerivedImages(referencedImageIds, {
    targetBufferType: options.targetBufferType,
  });

  const dataType = derivedImages[0].dataType;

  const derivedVolumeImageIds = derivedImages.map((image) => image.imageId);

  const derivedVolume = new ImageVolume({
    volumeId,
    dataType,
    metadata: structuredClone(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    referencedVolumeId,
    imageIds: derivedVolumeImageIds,
    referencedImageIds: referencedVolume.imageIds ?? [],
  }) as IImageVolume;

  cache.putVolumeSync(volumeId, derivedVolume);

  return derivedVolume;
}

export async function createAndCacheVolumeFromImages(
  volumeId: string,
  imageIds: string[]
): Promise<IImageVolume> {
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
    return cachedVolume;
  }

  const volume = (await createAndCacheVolume(volumeId, {
    imageIds,
  })) as IImageVolume;

  return volume;
}

/**
 * Creates and cache a volume based on a set of provided properties including
 * dimensions, spacing, origin, direction, metadata, scalarData. It should be noted that
 * scalarData should be provided for this function to work. If a volume with the same
 * Id exists in the cache it returns it immediately.
 * @param options - {scalarData, metadata, dimensions, spacing, origin, direction }
 * @param volumeId - Id of the generated volume
 *
 * @returns ImageVolume
 */
export function createLocalVolume(
  volumeId: string,
  options = {} as LocalVolumeOptions
): IImageVolume {
  const {
    metadata,
    dimensions,
    spacing,
    origin,
    direction,
    scalarData,
    targetBufferType,
    preventCache = false,
  } = options;

  // Check if the volume already exists in the cache
  const cachedVolume = cache.getVolume(volumeId);
  if (cachedVolume) {
    return cachedVolume;
  }

  const sliceLength = dimensions[0] * dimensions[1];

  const dataType = scalarData
    ? (scalarData.constructor.name as PixelDataTypedArrayString)
    : targetBufferType;

  const totalNumberOfVoxels = sliceLength * dimensions[2];
  let byteLength;
  switch (dataType) {
    case 'Uint8Array':
    case 'Int8Array':
      byteLength = totalNumberOfVoxels;
      break;
    case 'Uint16Array':
    case 'Int16Array':
      byteLength = totalNumberOfVoxels * 2;
      break;
    case 'Float32Array':
      byteLength = totalNumberOfVoxels * 4;
      break;
  }

  const isCacheable = cache.isCacheable(byteLength);

  if (!isCacheable) {
    throw new Error(
      `Cannot created derived volume: Volume with id ${volumeId} is not cacheable.`
    );
  }

  // Create derived images
  const imageIds = [];
  const derivedImages = [];
  for (let i = 0; i < dimensions[2]; i++) {
    const imageId = `${volumeId}_slice_${i}`;
    imageIds.push(imageId);

    const sliceData = scalarData.subarray(
      i * sliceLength,
      (i + 1) * sliceLength
    );

    const derivedImage = createAndCacheLocalImage(imageId, {
      scalarData: sliceData,
      dimensions: [dimensions[0], dimensions[1]],
      spacing: [spacing[0], spacing[1]],
      origin,
      direction,
      targetBufferType: dataType,
    });

    derivedImages.push(derivedImage);
  }

  // Create the image volume
  const imageVolume = new ImageVolume({
    volumeId,
    metadata: structuredClone(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    imageIds,
    dataType,
  });

  // Create and set voxel manager
  const voxelManager = VoxelManager.createImageVolumeVoxelManager({
    imageIds,
    dimensions,
    numberOfComponents: 1,
  });
  imageVolume.voxelManager = voxelManager;

  // use sync
  if (!preventCache) {
    cache.putVolumeSync(volumeId, imageVolume);
  }

  return imageVolume;
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
export function createAndCacheDerivedSegmentationVolume(
  referencedVolumeId: string,
  options = {} as DerivedVolumeOptions
): IImageVolume {
  return createAndCacheDerivedVolume(referencedVolumeId, {
    ...options,
    targetBufferType: 'Uint8Array',
  });
}

/**
 * Creates a local segmentation volume.
 *
 * @param options - The options for creating the volume.
 * @param volumeId - The ID of the volume.
 * @param preventCache - Whether to prevent caching the volume.
 * @returns A promise that resolves to the created image volume.
 */
export function createLocalSegmentationVolume(
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): IImageVolume {
  if (!options.scalarData) {
    options.scalarData = new Uint8Array(
      options.dimensions[0] * options.dimensions[1] * options.dimensions[2]
    );
  }

  return createLocalVolume(volumeId, { ...options, preventCache });
}
