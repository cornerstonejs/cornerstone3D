import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import type { vtkImageData as vtkImageDataType } from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

import { ImageVolume } from '../cache/classes/ImageVolume';
import cache from '../cache/cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import triggerEvent from '../utilities/triggerEvent';

import {
  createUint16SharedArray,
  createUint8SharedArray,
  createFloat32SharedArray,
  generateVolumePropsFromImageIds,
  getBufferConfiguration,
  uuidv4,
  VoxelManager,
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
import { getConfiguration, getShouldUseSharedArrayBuffer } from '../init';
import { imageLoader } from '..';
import vtkCustomImageData from '../RenderingEngine/vtkClasses/vtkCustomImageData';

interface VolumeLoaderOptions {
  imageIds: Array<string>;
}

interface DerivedVolumeOptions {
  volumeId: string;
  targetBufferType?: PixelDataTypedArrayString;
}
interface LocalVolumeOptions {
  metadata: Metadata;
  dimensions: Point3;
  spacing: Point3;
  origin: Point3;
  direction: Mat3;
  scalarData?: PixelDataTypedArray;
  imageIds?: Array<string>;
  referencedImageIds?: Array<string>;
  referencedVolumeId?: string;
  targetBuffer?: {
    type: PixelDataTypedArrayString;
    sharedArrayBuffer?: boolean;
  };
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

  const imageData = vtkCustomImageData.newInstance();
  const dataArrayAttrs = { numberOfComponents: numComponents };

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);
  imageData.setDirection(direction);
  imageData.setOrigin(origin);
  imageData.setDataType(volume.dataType);

  // Add scalar data to 3D or 4D volume
  // if (volume.isDynamicVolume()) {
  //   const scalarDataArrays = (<IDynamicImageVolume>(
  //     volume
  //   )).getScalarDataArrays();

  //   addScalarDataArraysToImageData(imageData, scalarDataArrays, dataArrayAttrs);
  // } else {
  //   const scalarData = volume.getScalarData();

  //   addScalarDataToImageData(imageData, scalarData, dataArrayAttrs);
  // }

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

  // setupCacheOptimizationEventListener(volumeId);

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

  // put the imageIds into the cache synchronously since they are just empty
  // images
  const derivedImages = imageLoader.createAndCacheDerivedImages(
    referencedImageIds,
    {
      targetBufferType: options.targetBufferType,
    }
  );

  const dataType = derivedImages[0].dataType;

  const derivedVolumeImageIds = derivedImages.map((image) => image.imageId);

  const voxelManager = VoxelManager.createImageVolumeVoxelManager({
    dimensions,
    imageIds: derivedVolumeImageIds,
  });

  const derivedVolume = new ImageVolume({
    volumeId,
    dataType,
    metadata: structuredClone(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    voxelManager,
    origin,
    direction,
    referencedVolumeId,
    imageIds: derivedVolumeImageIds,
    referencedImageIds: referencedVolume.imageIds ?? [],
  }) as IImageVolume;

  cache.putVolumeSync(volumeId, derivedVolume);

  return derivedVolume;
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
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): IImageVolume {
  // Todo: probably we need to deprecate this, or have it named like
  // createMemoryIntensiveVolume or something like that so that it shows
  // it is not recommended to use this function for large volumes
  const { metadata, dimensions, spacing, origin, direction, targetBuffer } =
    options;

  let { scalarData } = options;

  // Define the valid data types for scalarData
  const validDataTypes = [
    'Uint8Array',
    'Float32Array',
    'Uint16Array',
    'Int16Array',
  ];

  const scalarLength = dimensions[0] * dimensions[1] * dimensions[2];

  // Check if scalarData is provided and is of a valid type
  if (!scalarData || !validDataTypes.includes(scalarData.constructor.name)) {
    // Check if targetBuffer is provided and has a valid type
    if (!targetBuffer?.type || !validDataTypes.includes(targetBuffer.type)) {
      throw new Error(
        'createLocalVolume: parameter scalarData must be provided and must be either Uint8Array, Float32Array, Uint16Array or Int16Array'
      );
    }

    // Generate volume scalar data if scalarData is not provided or invalid
    ({ volumeScalarData: scalarData } = generateVolumeScalarData(
      targetBuffer,
      scalarLength
    ));
  }

  // Todo: handle default values for spacing, origin, direction if not provided
  if (volumeId === undefined) {
    volumeId = uuidv4();
  }

  const cachedVolume = cache.getVolume(volumeId);

  if (cachedVolume) {
    return cachedVolume as IImageVolume;
  }

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
  // imageData.setDataType(dataType);

  const voxelManager = VoxelManager.createImageVoxelManager({
    width: dimensions[0],
    height: dimensions[1],
    numComponents: 1,
    scalarData: scalarData,
  });

  const derivedVolume = new ImageVolume({
    volumeId,
    metadata: structuredClone(metadata),
    dimensions: [dimensions[0], dimensions[1], dimensions[2]],
    spacing,
    origin,
    direction,
    voxelManager,
    imageData: imageData,
    referencedImageIds: options.referencedImageIds || [],
    referencedVolumeId: options.referencedVolumeId,
    imageIds: options.imageIds || [],
  });

  if (preventCache) {
    return derivedVolume;
  }

  const volumeLoadObject = {
    promise: Promise.resolve(derivedVolume),
  };
  cache.putVolumeLoadObject(volumeId, volumeLoadObject);

  // performCacheOptimizationForVolume(derivedVolume);

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
export async function createLocalSegmentationVolume(
  options: LocalVolumeOptions,
  volumeId: string,
  preventCache = false
): Promise<IImageVolume> {
  if (!options.scalarData) {
    options.scalarData = new Uint8Array(
      options.dimensions[0] * options.dimensions[1] * options.dimensions[2]
    );
  }

  return createLocalVolume(options, volumeId, preventCache);
}

/**
 * This function generates volume scalar data based on the provided target buffer and scalar length.
 * It checks if the cache can accommodate the data size and throws an error if it exceeds the cache size.
 * If a shared array buffer is available in the target buffer, it uses that to create the typed array.
 * Otherwise, it creates a typed array based on the scalar length.
 *
 * @param targetBuffer - The target buffer object which may contain a type and a shared array buffer.
 * @param scalarLength - The scalar length for creating the typed array.
 * @param useNorm16Texture - A flag to specify whether to use a 16-bit texture or not.
 * @returns The volume scalar data as a typed array.
 */
function generateVolumeScalarData(
  targetBuffer: {
    type: PixelDataTypedArrayString;
    sharedArrayBuffer?: boolean;
  },
  scalarLength: number
) {
  const { useNorm16Texture } = getConfiguration().rendering;

  const { TypedArrayConstructor, numBytes } = getBufferConfiguration(
    targetBuffer?.type,
    scalarLength,
    {
      use16BitTexture: useNorm16Texture,
      isVolumeBuffer: true,
    }
  );

  const isCacheable = cache.isCacheable(numBytes);
  if (!isCacheable) {
    throw new Error(Events.CACHE_SIZE_EXCEEDED);
  }

  let volumeScalarData;
  if (targetBuffer?.sharedArrayBuffer ?? getShouldUseSharedArrayBuffer()) {
    switch (targetBuffer.type) {
      case 'Float32Array':
        volumeScalarData = createFloat32SharedArray(scalarLength);
        break;
      case 'Uint8Array':
        volumeScalarData = createUint8SharedArray(scalarLength);
        break;
      case 'Uint16Array':
        volumeScalarData = createUint16SharedArray(scalarLength);
        break;
      case 'Int16Array':
        volumeScalarData = createUint16SharedArray(scalarLength);
        break;
      default:
        throw new Error(
          'generateVolumeScalarData: SharedArrayBuffer is not supported for the specified target buffer type'
        );
    }
  } else {
    volumeScalarData = new TypedArrayConstructor(scalarLength);
  }

  return { volumeScalarData, numBytes };
}
