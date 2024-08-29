import cache from '../cache/cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import genericMetadataProvider from '../utilities/genericMetadataProvider';
import { getBufferConfiguration } from '../utilities/getBufferConfiguration';
import triggerEvent from '../utilities/triggerEvent';
import uuidv4 from '../utilities/uuidv4';
import VoxelManager from '../utilities/VoxelManager';
import type {
  IImage,
  ImageLoaderFn,
  IImageLoadObject,
  EventTypes,
  Point2,
  Point3,
  Mat3,
  PixelDataTypedArrayString,
  PixelDataTypedArray,
  ImagePlaneModuleMetadata,
  ImagePixelModuleMetadata,
} from '../types';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import * as metaData from '../metaData';

export interface ImageLoaderOptions {
  priority: number;
  requestType: string;
  additionalDetails?: Record<string, unknown>;
  ignoreCache?: boolean;
}

interface LocalImageOptions {
  scalarData?: PixelDataTypedArray;
  targetBuffer?: {
    type: PixelDataTypedArrayString;
  };
  dimensions?: Point2;
  spacing?: Point2;
  origin?: Point3;
  direction?: Mat3;
  /**
   * Skip creation of the actual buffer object.
   * In fact, this creates a very short buffer, as there are lots of places
   * assuming a buffer exists.
   * This can be used when there are alternative representations of the image data.
   */
  skipCreateBuffer?: boolean;
  /**
   * A method to call to update the image object when it gets added to the cache.
   * This can be used to create alternative representations of the image data,
   * such as a VoxelManager.
   */
  onCacheAdd?: (image: IImage) => void;
}

type DerivedImageOptions = LocalImageOptions & {
  imageId?: string;
  instanceNumber?: number;
};

/**
 * This module deals with ImageLoaders, loading images and caching images
 */
const imageLoaders = {};
let unknownImageLoader;

/**
 * Loads an image using a registered Cornerstone Image Loader.
 *
 * The image loader that is used will be
 * determined by the image loader scheme matching against the imageId.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param Options - to be passed to the Image Loader
 *
 * @returns - An Object which can be used to act after an image is loaded or loading fails
 */
function loadImageFromImageLoader(
  imageId: string,
  options: ImageLoaderOptions
): IImageLoadObject {
  // Attempt to retrieve the image from cache
  const cachedImageLoadObject = cache.getImageLoadObject(imageId);

  if (cachedImageLoadObject) {
    handleImageLoadPromise(cachedImageLoadObject.promise, imageId);
    return cachedImageLoadObject;
  }

  // Determine the appropriate image loader based on the image scheme
  const scheme = imageId.split(':')[0];
  const loader = imageLoaders[scheme] || unknownImageLoader;

  if (!loader) {
    throw new Error(
      `loadImageFromImageLoader: No image loader found for scheme '${scheme}'`
    );
  }

  // Load the image using the selected loader
  const imageLoadObject = loader(imageId, options);
  handleImageLoadPromise(imageLoadObject.promise, imageId);

  return imageLoadObject;
}

function handleImageLoadPromise(
  imagePromise: Promise<IImage>,
  imageId: string
): void {
  Promise.resolve(imagePromise)
    .then((image: IImage) => {
      ensureVoxelManager(image);
      triggerEvent(eventTarget, Events.IMAGE_LOADED, { image });
    })
    .catch((error) => {
      const errorDetails: EventTypes.ImageLoadedFailedEventDetail = {
        imageId,
        error,
      };
      triggerEvent(eventTarget, Events.IMAGE_LOAD_FAILED, errorDetails);
    });
}

function ensureVoxelManager(image: IImage): void {
  if (!image.voxelManager) {
    const { width, height, numberOfComponents } = image;
    const voxelManager = VoxelManager.createImageVoxelManager({
      scalarData: image.getPixelData(),
      width,
      height,
      numberOfComponents,
    });

    image.voxelManager = voxelManager;
    image.getPixelData = () => voxelManager.getScalarData();
    delete image.imageFrame.pixelData;
  }
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The loaded image is not stored in the cache.
 *
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns An Object which can be used to act after an image is loaded or loading fails
 */
export function loadImage(
  imageId: string,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage> {
  if (imageId === undefined) {
    throw new Error('loadImage: parameter imageId must not be undefined');
  }

  return loadImageFromImageLoader(imageId, options).promise;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param imageId -  A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns Image Loader Object
 */
export function loadAndCacheImage(
  imageId: string,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage> {
  if (imageId === undefined) {
    throw new Error(
      'loadAndCacheImage: parameter imageId must not be undefined'
    );
  }
  const imageLoadObject = loadImageFromImageLoader(imageId, options);

  // if not inside cache, store it
  if (!cache.getImageLoadObject(imageId)) {
    cache.putImageLoadObject(imageId, imageLoadObject);
  }

  return imageLoadObject.promise;
}

/**
 * Load and cache a list of imageIds
 *
 * @param imageIds - list of imageIds
 * @param options - options for loader
 *
 */
export function loadAndCacheImages(
  imageIds: string[],
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage>[] {
  if (!imageIds || imageIds.length === 0) {
    throw new Error(
      'loadAndCacheImages: parameter imageIds must be list of image Ids'
    );
  }

  const allPromises = imageIds.map((imageId) => {
    return loadAndCacheImage(imageId, options);
  });

  return allPromises;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param referencedImageId -  A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns Image Loader Object
 */
export function createAndCacheDerivedImage(
  referencedImageId: string,
  options: DerivedImageOptions = {}
): IImage {
  if (referencedImageId === undefined) {
    throw new Error(
      'createAndCacheDerivedImage: parameter imageId must not be undefined'
    );
  }

  if (options.imageId === undefined) {
    options.imageId = `derived:${uuidv4()}`;
  }

  const { imageId, skipCreateBuffer, onCacheAdd } = options;

  const imagePlaneModule = metaData.get('imagePlaneModule', referencedImageId);

  const length = imagePlaneModule.rows * imagePlaneModule.columns;

  const { TypedArrayConstructor } = getBufferConfiguration(
    options.targetBuffer?.type,
    length
  );

  // Use a buffer of size 1 for no data
  const imageScalarData = new TypedArrayConstructor(
    skipCreateBuffer ? 1 : length
  );
  const derivedImageId = imageId;
  const referencedImagePlaneMetadata = metaData.get(
    'imagePlaneModule',
    referencedImageId
  );

  genericMetadataProvider.add(derivedImageId, {
    type: 'imagePlaneModule',
    metadata: referencedImagePlaneMetadata,
  });

  const referencedImageGeneralSeriesMetadata = metaData.get(
    'generalSeriesModule',
    referencedImageId
  );

  genericMetadataProvider.add(derivedImageId, {
    type: 'generalSeriesModule',
    metadata: referencedImageGeneralSeriesMetadata,
  });

  genericMetadataProvider.add(derivedImageId, {
    type: 'generalImageModule',
    metadata: {
      instanceNumber: options.instanceNumber,
    },
  });

  const imagePixelModule = metaData.get('imagePixelModule', referencedImageId);
  genericMetadataProvider.add(derivedImageId, {
    type: 'imagePixelModule',
    metadata: {
      ...imagePixelModule,
      bitsAllocated: 8,
      bitsStored: 8,
      highBit: 7,
      samplesPerPixel: 1,
      pixelRepresentation: 0,
    },
  });

  const localImage = createAndCacheLocalImage(imageId, {
    scalarData: imageScalarData,
    onCacheAdd,
    skipCreateBuffer,
    targetBuffer: {
      type: imageScalarData.constructor.name as PixelDataTypedArrayString,
    },
    dimensions: [imagePlaneModule.columns, imagePlaneModule.rows],
    spacing: [
      imagePlaneModule.columnPixelSpacing,
      imagePlaneModule.rowPixelSpacing,
    ],
    origin: imagePlaneModule.imagePositionPatient,
    direction: imagePlaneModule.imageOrientationPatient,
  });

  // 3. Caching the image
  if (!cache.getImageLoadObject(imageId)) {
    cache.putImageSync(imageId, localImage);
  }

  return localImage;
}

/**
 * Load and cache a list of imageIds
 *
 * @param referencedImageIds - list of imageIds
 * @param options
 * @param options.getDerivedImageId - function to get the derived imageId
 * @param options.targetBuffer - target buffer type
 * @param options.skipBufferCreate - avoid creating the buffer
 */
export function createAndCacheDerivedImages(
  referencedImageIds: string[],
  options: DerivedImageOptions & {
    getDerivedImageId?: (referencedImageId: string) => string;
    targetBuffer?: {
      type: PixelDataTypedArrayString;
    };
  } = {}
): IImage[] {
  if (referencedImageIds.length === 0) {
    throw new Error(
      'createAndCacheDerivedImages: parameter imageIds must be list of image Ids'
    );
  }
  const derivedImageIds = [];
  const images = referencedImageIds.map((referencedImageId, index) => {
    const newOptions: DerivedImageOptions = {
      imageId:
        options?.getDerivedImageId?.(referencedImageId) ||
        `derived:${uuidv4()}`,
      ...options,
    };
    derivedImageIds.push(newOptions.imageId);
    return createAndCacheDerivedImage(referencedImageId, {
      ...newOptions,
      instanceNumber: index + 1,
    });
  });

  return images;
}

export function createAndCacheLocalImage(
  imageId: string,
  options: LocalImageOptions
): IImage {
  const {
    scalarData,
    origin,
    direction,
    targetBuffer,
    skipCreateBuffer,
    onCacheAdd,
  } = options;

  const dimensions = options.dimensions;
  const spacing = options.spacing;

  if (!dimensions || !spacing) {
    throw new Error(
      'createAndCacheLocalImage: dimensions and spacing are required'
    );
  }

  const width = dimensions[0];
  const height = dimensions[1];
  const columnPixelSpacing = spacing[0];
  const rowPixelSpacing = spacing[1];

  const imagePlaneModule = {
    rows: height.toString(),
    columns: width.toString(),
    imageOrientationPatient: direction ?? [1, 0, 0, 0, 1, 0],
    rowCosines: direction ? direction.slice(0, 3) : [1, 0, 0],
    columnCosines: direction ? direction.slice(3, 6) : [0, 1, 0],
    imagePositionPatient: origin ?? [0, 0, 0],
    pixelSpacing: [rowPixelSpacing, columnPixelSpacing],
    rowPixelSpacing: rowPixelSpacing,
    columnPixelSpacing: columnPixelSpacing,
  } as ImagePlaneModuleMetadata;

  const length = width * height;
  const numberOfComponents = scalarData.length / length;

  let scalarDataToUse;
  if (scalarData) {
    if (
      !(
        scalarData instanceof Uint8Array ||
        scalarData instanceof Float32Array ||
        scalarData instanceof Uint16Array ||
        scalarData instanceof Int16Array
      )
    ) {
      throw new Error(
        'createAndCacheLocalImage: scalarData must be of type Uint8Array, Uint16Array, Int16Array or Float32Array'
      );
    }

    scalarDataToUse = scalarData;
  } else if (!skipCreateBuffer) {
    // Todo: need to handle numberOfComponents > 1
    const { numBytes, TypedArrayConstructor } = getBufferConfiguration(
      targetBuffer?.type,
      length
    );

    const imageScalarData = new TypedArrayConstructor(length);

    scalarDataToUse = imageScalarData;
  }

  // Determine bit depth based on scalarData type
  let bitsAllocated, bitsStored, highBit;
  if (scalarDataToUse instanceof Uint8Array) {
    bitsAllocated = 8;
    bitsStored = 8;
    highBit = 7;
  } else if (scalarDataToUse instanceof Uint16Array) {
    bitsAllocated = 16;
    bitsStored = 16;
    highBit = 15;
  } else if (scalarDataToUse instanceof Int16Array) {
    bitsAllocated = 16;
    bitsStored = 16;
    highBit = 15;
  } else if (scalarDataToUse instanceof Float32Array) {
    bitsAllocated = 32;
    bitsStored = 32;
    highBit = 31;
  } else {
    throw new Error('Unsupported scalarData type');
  }

  // Prepare ImagePixelModuleMetadata
  const imagePixelModule = {
    samplesPerPixel: 1,
    photometricInterpretation:
      scalarDataToUse.length > dimensions[0] * dimensions[1]
        ? 'RGB'
        : 'MONOCHROME2', // or 1
    rows: height,
    columns: width,
    bitsAllocated,
    bitsStored,
    highBit,
  } as ImagePixelModuleMetadata;

  const metadata = {
    imagePlaneModule,
    imagePixelModule,
  };

  // Add metadata to genericMetadataProvider
  ['imagePlaneModule', 'imagePixelModule'].forEach((type) => {
    genericMetadataProvider.add(imageId, {
      type,
      metadata: metadata[type] || {},
    });
  });

  const voxelManager = VoxelManager.createImageVoxelManager({
    height,
    width,
    numberOfComponents,
    scalarData: scalarDataToUse,
  });

  const image = {
    imageId: imageId,
    intercept: 0,
    windowCenter: 0,
    windowWidth: 0,
    color: imagePixelModule.photometricInterpretation === 'RGB',
    numberOfComponents: imagePixelModule.samplesPerPixel,
    dataType: targetBuffer?.type,
    slope: 1,
    minPixelValue: 0,
    maxPixelValue: Math.pow(2, imagePixelModule.bitsStored) - 1,
    rows: imagePixelModule.rows,
    columns: imagePixelModule.columns,
    getCanvas: undefined,
    height: imagePixelModule.rows,
    width: imagePixelModule.columns,
    rgba: undefined,
    columnPixelSpacing: imagePlaneModule.columnPixelSpacing,
    rowPixelSpacing: imagePlaneModule.rowPixelSpacing,
    FrameOfReferenceUID: imagePlaneModule.frameOfReferenceUID,
    invert: false,
    getPixelData: () => voxelManager.getScalarData(),
    voxelManager,
    sizeInBytes: scalarData.byteLength,
  } as IImage;

  onCacheAdd?.(image);

  cache.putImageSync(image.imageId, image);

  return image;
}

/**
 * Removes the imageId from the request pool manager and executes the `cancel`
 * function if it exists.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 *
 */
export function cancelLoadImage(imageId: string): void {
  const filterFunction = ({ additionalDetails }) => {
    if (additionalDetails.imageId) {
      return additionalDetails.imageId !== imageId;
    }

    // for volumes
    return true;
  };

  // Instruct the request pool manager to filter queued
  // requests to ensure requests we no longer need are
  // no longer sent.
  imageLoadPoolManager.filterRequests(filterFunction);

  // TODO: Cancel decoding and retrieval as well (somehow?)

  // cancel image loading if in progress
  const imageLoadObject = cache.getImageLoadObject(imageId);

  if (imageLoadObject) {
    imageLoadObject.cancelFn();
  }
}

/**
 * Removes the imageIds from the request pool manager and calls the `cancel`
 * function if it exists.
 *
 * @param imageIds - Array of Cornerstone Image Object's imageIds
 *
 */
export function cancelLoadImages(imageIds: string[]): void {
  imageIds.forEach((imageId) => {
    cancelLoadImage(imageId);
  });
}

/**
 * Removes all the ongoing image loads by calling the `cancel` method on each
 * imageLoadObject. If no `cancel` method is available, it will be ignored.
 *
 */
export function cancelLoadAll(): void {
  const requestPool = imageLoadPoolManager.getRequestPool();

  Object.keys(requestPool).forEach((type: string) => {
    const requests = requestPool[type];

    Object.keys(requests).forEach((priority) => {
      const requestDetails = requests[priority].pop();
      const additionalDetails = requestDetails.additionalDetails;
      const { imageId, volumeId } = additionalDetails;

      let loadObject;

      if (imageId) {
        loadObject = cache.getImageLoadObject(imageId);
      } else if (volumeId) {
        loadObject = cache.getVolumeLoadObject(volumeId);
      }
      if (loadObject) {
        loadObject.cancel();
      }
    });
    // resetting the pool types to be empty
    imageLoadPoolManager.clearRequestStack(type);

    // TODO: Clear retrieval and decoding queues as well
  });
}

/**
 * Registers an imageLoader plugin with cornerstone for the specified scheme
 *
 * @param scheme - The scheme to use for this image loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param imageLoader - A Cornerstone Image Loader function
 */
export function registerImageLoader(
  scheme: string,
  imageLoader: ImageLoaderFn
): void {
  imageLoaders[scheme] = imageLoader;
}
/**
 * Registers a new unknownImageLoader and returns the previous one
 *
 * @param imageLoader - A Cornerstone Image Loader
 *
 * @returns The previous Unknown Image Loader
 */
export function registerUnknownImageLoader(
  imageLoader: ImageLoaderFn
): ImageLoaderFn {
  const oldImageLoader = unknownImageLoader;
  unknownImageLoader = imageLoader;
  return oldImageLoader;
}
/**
 * Removes all registered and unknown image loaders. This should be called
 * when the application is unmounted to prevent memory leaks.
 *
 */
export function unregisterAllImageLoaders(): void {
  Object.keys(imageLoaders).forEach(
    (imageLoader) => delete imageLoaders[imageLoader]
  );
  unknownImageLoader = undefined;
}

/**
 * Creates and caches derived segmentation images based on the referenced imageIds, this
 * is a helper function, we don't have segmentation concept in the cornerstone core; however,
 * this helper would make it clear that the segmentation images SHOULD be Uint8Array type
 * always until we have a better solution.
 *
 * @param referencedImageIds - An array of referenced image IDs.
 * @param options - The options for creating the derived images (default: { targetBuffer: { type: 'Uint8Array' } }).
 * @returns The derived images.
 */
export function createAndCacheDerivedSegmentationImages(
  referencedImageIds: string[],
  options = {} as DerivedImageOptions
): IImage[] {
  return createAndCacheDerivedImages(referencedImageIds, {
    ...options,
    targetBuffer: { type: 'Uint8Array' },
  });
}

/**
 * Creates and caches a derived segmentation image based on the referenced image ID.
 * this is a helper function, we don't have segmentation concept in the cornerstone core; however,
 * this helper would make it clear that the segmentation images SHOULD be Uint8Array type
 * always until we have a better solution.
 *
 * @param referencedImageId The ID of the referenced image.
 * @param options The options for creating the derived image (default: { targetBuffer: { type: 'Uint8Array' } }).
 * @returns A promise that resolves to the created derived segmentation image.
 */
export function createAndCacheDerivedSegmentationImage(
  referencedImageId: string,
  options = {} as DerivedImageOptions
): IImage {
  return createAndCacheDerivedImage(referencedImageId, {
    ...options,
    targetBuffer: { type: 'Uint8Array' },
  });
}
