import cache from '../cache/cache';
import Events from '../enums/Events';
import MetadataModules from '../enums/MetadataModules';
import { ImageQualityStatus } from '../enums';
import eventTarget from '../eventTarget';
import genericMetadataProvider from '../utilities/genericMetadataProvider';
import { getBufferConfiguration } from '../utilities/getBufferConfiguration';
import triggerEvent from '../utilities/triggerEvent';
import uuidv4 from '../utilities/uuidv4';
import VoxelManager, { DEFAULT_RLE_SIZE } from '../utilities/VoxelManager';
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
  RetrieveOptions,
} from '../types';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import * as metaData from '../metaData';
import VoxelManagerEnum from '../enums/VoxelManagerEnum';
import { getConfiguration } from '../init';

export interface ImageLoaderOptions {
  priority: number;
  requestType: string;
  additionalDetails?: Record<string, unknown>;
  ignoreCache?: boolean;
  retrieveOptions?: RetrieveOptions;
}

interface LocalImageOptions {
  frameOfReferenceUID?: string;
  scalarData?: PixelDataTypedArray;
  targetBuffer?: {
    type: PixelDataTypedArrayString;
  };
  voxelRepresentation?: VoxelManagerEnum;
  dimensions?: Point2;
  spacing?: Point2;
  origin?: Point3;
  direction?: Mat3;
  referencedImageId?: string;
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

function getRequestedImageQualityStatus(
  options: ImageLoaderOptions
): ImageQualityStatus {
  return (
    options.retrieveOptions?.imageQualityStatus ??
    ImageQualityStatus.FULL_RESOLUTION
  );
}

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
  const cachedImageLoadObject =
    !options.ignoreCache && cache.getImageLoadObject(imageId);

  if (cachedImageLoadObject) {
    // This is an in-progress image, which someone else is loading, so just
    // handle the response directly.
    handleImageLoadPromise(cachedImageLoadObject.promise, imageId);
    return cachedImageLoadObject;
  }

  // Progressive retrieval intentionally leaves partial images in the cache
  // while scheduling a final request. Never replace this with a quality-blind
  // cache.getImage(imageId) shortcut, or the final request can resolve to the
  // partial image and the volume will never receive full-resolution data.
  const cachedImage =
    !options.ignoreCache &&
    cache.getImage(imageId, getRequestedImageQualityStatus(options));

  if (cachedImage) {
    const imageLoadObject = {
      promise: Promise.resolve(cachedImage),
    };

    handleImageLoadPromise(imageLoadObject.promise, imageId);

    return imageLoadObject;
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
    image.getPixelData = () =>
      voxelManager.getScalarData() as PixelDataTypedArray;
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

  const { imageId, skipCreateBuffer, onCacheAdd, voxelRepresentation } =
    options;

  const imagePlaneModule = metaData.get(
    MetadataModules.IMAGE_PLANE,
    referencedImageId
  );

  const length = imagePlaneModule.rows * imagePlaneModule.columns;

  const { TypedArrayConstructor } = getBufferConfiguration(
    options.targetBuffer?.type,
    length
  );

  // Use a buffer of size 1 for no data. An RLE representation stores the voxels
  // in its runs and never reads this buffer, so allocating a full frame for it
  // would be the exact per-slice cost the encoding exists to avoid; it is still
  // created at size 1 because the pixel/bit-depth metadata below is derived
  // from its type.
  const isRleRepresentation = voxelRepresentation === VoxelManagerEnum.RLE;
  const imageScalarData = new TypedArrayConstructor(
    skipCreateBuffer || isRleRepresentation ? 1 : length
  );
  const derivedImageId = imageId;
  const referencedImagePlaneMetadata = metaData.get(
    MetadataModules.IMAGE_PLANE,
    referencedImageId
  );

  genericMetadataProvider.add(derivedImageId, {
    type: MetadataModules.IMAGE_PLANE,
    metadata: referencedImagePlaneMetadata,
  });

  const referencedImageGeneralSeriesMetadata = metaData.get(
    MetadataModules.GENERAL_SERIES,
    referencedImageId
  );

  genericMetadataProvider.add(derivedImageId, {
    type: MetadataModules.GENERAL_SERIES,
    metadata: referencedImageGeneralSeriesMetadata,
  });

  genericMetadataProvider.add(derivedImageId, {
    type: MetadataModules.GENERAL_IMAGE,
    metadata: {
      instanceNumber: options.instanceNumber,
    },
  });

  const imagePixelModule = metaData.get(
    MetadataModules.IMAGE_PIXEL,
    referencedImageId
  );
  genericMetadataProvider.add(derivedImageId, {
    type: MetadataModules.IMAGE_PIXEL,
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
    voxelRepresentation,
    dimensions: [imagePlaneModule.columns, imagePlaneModule.rows],
    spacing: [
      imagePlaneModule.columnPixelSpacing,
      imagePlaneModule.rowPixelSpacing,
    ],
    origin: imagePlaneModule.imagePositionPatient,
    direction: imagePlaneModule.imageOrientationPatient,
    frameOfReferenceUID: imagePlaneModule.frameOfReferenceUID,
    referencedImageId: referencedImageId,
  });

  localImage.referencedImageId = referencedImageId;

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
    voxelRepresentation?: VoxelManagerEnum;
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
    frameOfReferenceUID,
    voxelRepresentation,
    referencedImageId,
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
    frameOfReferenceUID,
    rows: height,
    columns: width,
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
    const { TypedArrayConstructor } = getBufferConfiguration(
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
  [MetadataModules.IMAGE_PLANE, MetadataModules.IMAGE_PIXEL].forEach((type) => {
    genericMetadataProvider.add(imageId, {
      type,
      metadata: metadata[type] || {},
    });
  });

  const id = imageId;

  const isRle = voxelRepresentation === VoxelManagerEnum.RLE;
  const voxelManager =
    (isRle &&
      VoxelManager.createRLEImageVoxelManager<number>({
        dimensions,
        id,
        // The RLE map is standing in for `scalarDataToUse`, so expanded frames
        // keep that array's type and an unwritten voxel reads as its zero.
        pixelDataConstructor: scalarDataToUse.constructor as new (
          length: number
        ) => PixelDataTypedArray,
        defaultValue: 0,
      })) ||
    (VoxelManager.createImageVoxelManager({
      height,
      width,
      numberOfComponents,
      scalarData: scalarDataToUse,
      id,
    }) as VoxelManager<number>);

  // Calculate min and max pixel values
  let minPixelValue = scalarDataToUse[0];
  let maxPixelValue = scalarDataToUse[0];

  for (let i = 1; i < scalarDataToUse.length; i++) {
    if (scalarDataToUse[i] < minPixelValue) {
      minPixelValue = scalarDataToUse[i];
    }
    if (scalarDataToUse[i] > maxPixelValue) {
      maxPixelValue = scalarDataToUse[i];
    }
  }

  const image = {
    imageId: imageId,
    intercept: 0,
    windowCenter: 0,
    windowWidth: 0,
    color: imagePixelModule.photometricInterpretation === 'RGB',
    numberOfComponents: imagePixelModule.samplesPerPixel,
    dataType: targetBuffer?.type,
    slope: 1,
    minPixelValue,
    maxPixelValue,
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
    // An RLE image has no up-front size (its runs grow as voxels are written),
    // so it is charged the same nominal figure `addInstanceToImage` uses rather
    // than the size of the 1-element stand-in buffer above.
    sizeInBytes: isRle ? DEFAULT_RLE_SIZE : scalarData.byteLength,
    referencedImageId,
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
      if (!requestDetails) {
        return;
      }

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
 * The in-memory representation labelmap pixel data is stored in, from
 * `segmentation.labelmapVoxelRepresentation` in the cornerstone configuration
 * (see `init` / `setConfiguration`).
 *
 * A labelmap frame is mostly background - a few contiguous runs of segment
 * values per row - so RLE holds the same content in a fraction of the memory of
 * a full `Uint8Array` per slice, and answers per-row questions ("is segment N
 * on this slice?") from the runs instead of a whole-frame scan, which is what
 * makes a large multi-segment SEG (a whole-body AI segmentation, say) workable.
 * It is opt-in because it changes what a host reads back out of a labelmap: an
 * RLE frame's `getScalarData()` is a fresh expansion rather than the live
 * buffer, so in-place writes to it are discarded.
 *
 * Configuring it covers the labelmaps created deep inside the SEG adapter,
 * where no per-call option can be threaded through. An individual call can
 * still override it with `voxelRepresentation`.
 *
 * The configured value may be the bare string rather than the enum member, so
 * that it can come straight from a host's JSON configuration. It is matched
 * exactly - an unrecognized value (`'rle'`, say) warns and falls back to
 * `Volume`, because the alternative is a flag that appears to have been set and
 * silently does nothing.
 */
export function getDefaultLabelmapVoxelRepresentation(): VoxelManagerEnum {
  const configured =
    getConfiguration().segmentation?.labelmapVoxelRepresentation;

  if (configured === undefined) {
    return VoxelManagerEnum.Volume;
  }

  if (
    configured === VoxelManagerEnum.RLE ||
    configured === VoxelManagerEnum.Volume
  ) {
    return configured as VoxelManagerEnum;
  }

  console.warn(
    `Unrecognized segmentation.labelmapVoxelRepresentation "${configured}"; expected ` +
      `"${VoxelManagerEnum.RLE}" or "${VoxelManagerEnum.Volume}". Falling back to ` +
      `"${VoxelManagerEnum.Volume}".`
  );

  return VoxelManagerEnum.Volume;
}

/**
 * Creates and caches derived segmentation images based on the referenced imageIds, this
 * is a helper function, we don't have segmentation concept in the cornerstone core; however,
 * this helper would make it clear that the segmentation images SHOULD be Uint8Array type
 * always until we have a better solution.
 *
 * @param referencedImageIds - An array of referenced image IDs.
 * @param options - The options for creating the derived images. `targetBuffer` is
 *   always `{ type: 'Uint8Array' }`; `voxelRepresentation` defaults to
 *   `getDefaultLabelmapVoxelRepresentation()`, i.e.
 *   `segmentation.labelmapVoxelRepresentation` from the cornerstone
 *   configuration, which is `VoxelManagerEnum.Volume` unless a host opts in.
 * @returns The derived images.
 */
export function createAndCacheDerivedLabelmapImages(
  referencedImageIds: string[],
  options = {} as DerivedImageOptions
): IImage[] {
  const {
    voxelRepresentation = getDefaultLabelmapVoxelRepresentation(),
    ...rest
  } = options;

  return createAndCacheDerivedImages(referencedImageIds, {
    ...rest,
    voxelRepresentation,
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
 * @param options The options for creating the derived image. `targetBuffer` is
 *   always `{ type: 'Uint8Array' }`; `voxelRepresentation` defaults to
 *   `getDefaultLabelmapVoxelRepresentation()`, i.e.
 *   `segmentation.labelmapVoxelRepresentation` from the cornerstone
 *   configuration, which is `VoxelManagerEnum.Volume` unless a host opts in.
 * @returns A promise that resolves to the created derived segmentation image.
 */
export function createAndCacheDerivedLabelmapImage(
  referencedImageId: string,
  options = {} as DerivedImageOptions
): IImage {
  const {
    voxelRepresentation = getDefaultLabelmapVoxelRepresentation(),
    ...rest
  } = options;

  return createAndCacheDerivedImage(referencedImageId, {
    ...rest,
    voxelRepresentation,
    targetBuffer: { type: 'Uint8Array' },
  });
}
