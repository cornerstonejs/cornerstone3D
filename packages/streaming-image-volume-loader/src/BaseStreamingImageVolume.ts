import {
  Enums,
  eventTarget,
  metaData,
  imageLoadPoolManager,
  triggerEvent,
  ImageVolume,
  cache,
  imageLoader,
  utilities as csUtils,
  ProgressiveRetrieveImages,
  canRenderFloatTextures,
} from '@cornerstonejs/core';
import type {
  Types,
  IImagesLoader,
  ImageLoadListener,
} from '@cornerstonejs/core';

import { scaleArray, autoLoad } from './helpers';

const requestTypeDefault = Enums.RequestType.Prefetch;
const {
  ProgressiveIterator,
  imageRetrieveMetadataProvider,
  hasFloatScalingParameters,
} = csUtils;
const { ImageQualityStatus } = Enums;

/**
 * Streaming Image Volume Class that extends ImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 *
 */
export default class BaseStreamingImageVolume
  extends ImageVolume
  implements IImagesLoader
{
  private framesLoaded = 0;
  private framesProcessed = 0;
  private framesUpdated = 0;
  protected autoRenderOnLoad = true;
  protected cachedFrames = [];
  protected reRenderTarget = 0;
  protected reRenderFraction = 2;

  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cancelled: boolean;
    callbacks: Array<(...args: unknown[]) => void>;
  };
  imagesLoader: IImagesLoader = this;

  constructor(
    imageVolumeProperties: Types.ImageVolumeProps,
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties);
    this.loadStatus = streamingProperties.loadStatus;
  }

  protected invalidateVolume(immediate: boolean): void {
    const { imageData, vtkOpenGLTexture } = this;
    const { numFrames } = this;

    for (let i = 0; i < numFrames; i++) {
      vtkOpenGLTexture.setUpdatedFrame(i);
    }

    imageData.modified();

    if (immediate) {
      autoLoad(this.volumeId);
    }
  }

  /**
   * It cancels loading the images of the volume. It sets the loading status to false
   * and filters any imageLoad request in the requestPoolManager that has the same
   * volumeId
   */
  public cancelLoading = (): void => {
    const { loadStatus } = this;

    if (!loadStatus || !loadStatus.loading) {
      return;
    }

    // Set to not loading.
    loadStatus.loading = false;
    loadStatus.cancelled = true;

    // Remove all the callback listeners
    this.clearLoadCallbacks();

    // Create a filter function which only keeps requests
    // which do not match this volume's Id
    const filterFunction = ({ additionalDetails }) => {
      return additionalDetails.volumeId !== this.volumeId;
    };

    // Instruct the request pool manager to filter queued
    // requests to ensure requests we no longer need are
    // no longer sent.
    imageLoadPoolManager.filterRequests(filterFunction);
  };

  /**
   * Clear the load callbacks
   */
  public clearLoadCallbacks(): void {
    this.loadStatus.callbacks = [];
  }

  protected callLoadStatusCallback(evt) {
    const { framesUpdated, framesProcessed, totalNumFrames } = evt;
    const { volumeId, reRenderFraction, loadStatus, metadata } = this;
    const { FrameOfReferenceUID } = metadata;

    // TODO: probably don't want this here
    if (this.autoRenderOnLoad) {
      if (
        framesUpdated > this.reRenderTarget ||
        framesProcessed === totalNumFrames
      ) {
        this.reRenderTarget += reRenderFraction;
        autoLoad(volumeId);
      }
    }
    if (framesProcessed === totalNumFrames) {
      loadStatus.callbacks.forEach((callback) => callback(evt));

      const eventDetail = {
        FrameOfReferenceUID,
        volumeId: volumeId,
      };

      triggerEvent(
        eventTarget,
        Enums.Events.IMAGE_VOLUME_LOADING_COMPLETED,
        eventDetail
      );
    }
  }

  protected updateTextureAndTriggerEvents(
    imageIdIndex,
    imageId,
    imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION
  ) {
    const frameIndex = this.imageIdIndexToFrameIndex(imageIdIndex);
    const { cachedFrames, numFrames, totalNumFrames } = this;
    const { FrameOfReferenceUID } = this.metadata;
    const currentStatus = cachedFrames[frameIndex];
    if (currentStatus > imageQualityStatus) {
      // This is common for initial versus decimated images.
      return;
    }

    if (cachedFrames[frameIndex] === ImageQualityStatus.FULL_RESOLUTION) {
      // Sometimes the frame can be delivered multiple times, so just return
      // here if that happens
      return;
    }
    const complete = imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION;
    cachedFrames[imageIdIndex] = imageQualityStatus;
    this.framesUpdated++;
    if (complete) {
      this.framesLoaded++;
      this.framesProcessed++;
    }

    this.vtkOpenGLTexture.setUpdatedFrame(frameIndex);
    this.imageData.modified();

    const eventDetail: Types.EventTypes.ImageVolumeModifiedEventDetail = {
      FrameOfReferenceUID,
      imageVolume: this,
      numberOfFrames: numFrames,
      framesProcessed: this.framesProcessed,
    };

    triggerEvent(eventTarget, Enums.Events.IMAGE_VOLUME_MODIFIED, eventDetail);

    if (complete && this.framesProcessed === this.totalNumFrames) {
      this.loadStatus.loaded = true;
      this.loadStatus.loading = false;
    }

    this.callLoadStatusCallback({
      success: true,
      imageIdIndex,
      imageId,
      framesLoaded: this.framesLoaded,
      framesProcessed: this.framesProcessed,
      framesUpdated: this.framesUpdated,
      numFrames,
      totalNumFrames,
      complete,
      imageQualityStatus,
    });
    if (this.loadStatus.loaded) {
      this.loadStatus.callbacks = [];
    }
  }

  public successCallback(imageId: string, image) {
    const imageIdIndex = this.getImageIdIndex(imageId);
    const options = this.getLoaderImageOptions(imageId);
    const scalarData = this.getScalarDataByImageIdIndex(imageIdIndex);

    handleArrayBufferLoad(scalarData, image, options);

    const { scalingParameters } = image.preScale || {};
    const { imageQualityStatus } = image;
    const frameIndex = this.imageIdIndexToFrameIndex(imageIdIndex);

    // Check if there is a cached image for the same imageURI (different
    // data loader scheme)
    const cachedImage = cache.getCachedImageBasedOnImageURI(imageId);

    // Check if the image was already loaded by another volume and we are here
    // since we got the imageLoadObject from the cache from the other already loaded
    // volume
    const cachedVolume = cache.getVolumeContainingImageId(imageId);

    // check if the load was cancelled while we were waiting for the image
    // if so we don't want to do anything
    if (this.loadStatus.cancelled) {
      console.warn(
        'volume load cancelled, returning for imageIdIndex: ',
        imageIdIndex
      );
      return;
    }

    // if it is not a cached image or volume
    if (!cachedImage && !(cachedVolume && cachedVolume.volume !== this)) {
      return this.updateTextureAndTriggerEvents(
        imageIdIndex,
        imageId,
        imageQualityStatus
      );
    }

    // it is either cachedImage or cachedVolume
    const isFromImageCache = !!cachedImage;

    if (isFromImageCache && options.targetBuffer) {
      // put it in the imageCacheOffsetMap, since we are going to use it
      // for cache optimization later
      this.imageCacheOffsetMap.set(imageId, {
        imageIdIndex,
        frameIndex,
        offset: options.targetBuffer?.offset || 0,
        length: options.targetBuffer?.length,
      });
    }

    const cachedImageOrVolume = cachedImage || cachedVolume.volume;

    this.handleImageComingFromCache(
      cachedImageOrVolume,
      isFromImageCache,
      scalingParameters,
      scalarData,
      frameIndex,
      scalarData.buffer,
      imageIdIndex,
      imageId
    );
  }

  public errorCallback(imageId, permanent, error) {
    if (!permanent) {
      return;
    }
    const { totalNumFrames, numFrames } = this;
    const imageIdIndex = this.getImageIdIndex(imageId);
    this.framesProcessed++;

    if (this.framesProcessed === totalNumFrames) {
      this.loadStatus.loaded = true;
      this.loadStatus.loading = false;
    }

    this.callLoadStatusCallback({
      success: false,
      imageId,
      imageIdIndex,
      error,
      framesLoaded: this.framesLoaded,
      framesProcessed: this.framesProcessed,
      framesUpdated: this.framesUpdated,
      numFrames,
      totalNumFrames,
    });

    if (this.loadStatus.loaded) {
      this.loadStatus.callbacks = [];
    }

    const eventDetail = {
      error,
      imageIdIndex,
      imageId,
    };

    triggerEvent(eventTarget, Enums.Events.IMAGE_LOAD_ERROR, eventDetail);
  }

  /**
   * It triggers a prefetch for images in the volume.
   * @param callback - A callback function to be called when the volume is fully loaded
   * @param priority - The priority for loading the volume images, lower number is higher priority
   * @returns
   */
  public load = (callback: (...args: unknown[]) => void): void => {
    const { imageIds, loadStatus, numFrames } = this;
    const { transferSyntaxUID } =
      metaData.get('transferSyntax', imageIds[0]) || {};
    const imageRetrieveConfiguration = metaData.get(
      imageRetrieveMetadataProvider.IMAGE_RETRIEVE_CONFIGURATION,
      this.volumeId,
      transferSyntaxUID,
      'volume'
    );

    this.imagesLoader = imageRetrieveConfiguration
      ? (
          imageRetrieveConfiguration.create ||
          ProgressiveRetrieveImages.createProgressive
        )(imageRetrieveConfiguration)
      : this;
    if (loadStatus.loading === true) {
      return; // Already loading, will get callbacks from main load.
    }

    const { loaded } = this.loadStatus;
    const totalNumFrames = imageIds.length;

    if (loaded) {
      if (callback) {
        callback({
          success: true,
          framesLoaded: totalNumFrames,
          framesProcessed: totalNumFrames,
          numFrames,
          totalNumFrames,
        });
      }
      return;
    }

    if (callback) {
      this.loadStatus.callbacks.push(callback);
    }

    this._prefetchImageIds();
  };

  public getLoaderImageOptions(imageId: string) {
    const { transferSyntaxUID: transferSyntaxUID } =
      metaData.get('transferSyntax', imageId) || {};

    const imagePlaneModule = metaData.get('imagePlaneModule', imageId) || {};
    const { rows, columns } = imagePlaneModule;
    const imageIdIndex = this.getImageIdIndex(imageId);
    const scalarData = this.getScalarDataByImageIdIndex(imageIdIndex);
    if (!scalarData) {
      return null;
    }
    const arrayBuffer = scalarData.buffer;
    // Length of one frame in voxels: length
    // Length of one frame in bytes: lengthInBytes
    const { type, length, lengthInBytes } = getScalarDataType(
      scalarData,
      this.numFrames
    );

    const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};

    const generalSeriesModule =
      metaData.get('generalSeriesModule', imageId) || {};

    const scalingParameters: Types.ScalingParameters = {
      rescaleSlope: modalityLutModule.rescaleSlope,
      rescaleIntercept: modalityLutModule.rescaleIntercept,
      modality: generalSeriesModule.modality,
    };

    if (scalingParameters.modality === 'PT') {
      const suvFactor = metaData.get('scalingModule', imageId);

      if (suvFactor) {
        this._addScalingToVolume(suvFactor);
        scalingParameters.suvbw = suvFactor.suvbw;
      }
    }

    const isSlopeAndInterceptNumbers =
      typeof scalingParameters.rescaleSlope === 'number' &&
      typeof scalingParameters.rescaleIntercept === 'number';

    const floatAfterScale = hasFloatScalingParameters(scalingParameters);
    const allowFloatRendering = canRenderFloatTextures();

    /**
     * So this is has limitation right now, but we need to somehow indicate
     * whether the volume has been scaled with the scaling parameters or not.
     * However, each slice can have different scaling parameters but it is rare
     * that rescale slope and intercept be unknown for one slice and known for
     * another. So we can just check the first slice and assume that the rest
     * of the slices have the same scaling parameters. Basically it is important
     * that these two are numbers and that means the volume has been scaled (
     * we do that automatically in the loader). For the suvbw, we need to
     * somehow indicate whether the PT image has been corrected with suvbw or
     * not, which we store it in the this.scaling.PT.suvbw.
     */
    this.isPreScaled = isSlopeAndInterceptNumbers;

    // in case where the hardware/os does not support float rendering but the
    // requested scaling params are not integers, we need to disable pre-scaling
    if (!allowFloatRendering && floatAfterScale) {
      this.isPreScaled = false;
    }

    const frameIndex = this.imageIdIndexToFrameIndex(imageIdIndex);

    return {
      // WADO Image Loader
      targetBuffer: {
        // keeping this in the options means a large empty volume array buffer
        // will be transferred to the worker. This is undesirable for streaming
        // volume without shared array buffer because the target is now an empty
        // 300-500MB volume array buffer. Instead the volume should be progressively
        // set in the main thread.
        arrayBuffer:
          arrayBuffer instanceof ArrayBuffer ? undefined : arrayBuffer,
        offset: frameIndex * lengthInBytes,
        length,
        type,
        rows,
        columns,
      },
      skipCreateImage: true,
      allowFloatRendering,
      preScale: {
        enabled: this.isPreScaled,
        // we need to pass in the scalingParameters here, since the streaming
        // volume loader doesn't go through the createImage phase in the loader,
        // and therefore doesn't have the scalingParameters
        scalingParameters,
      },
      transferPixelData: true,
      transferSyntaxUID,
      // The loader is used to load the image into the cache
      loader: imageLoader.loadImage,
      additionalDetails: {
        imageId,
        imageIdIndex,
        volumeId: this.volumeId,
      },
    };
  }

  // Use loadImage because we are skipping the Cornerstone Image cache
  // when we load directly into the Volume cache
  callLoadImage(imageId, imageIdIndex, options) {
    const { cachedFrames } = this;

    if (cachedFrames[imageIdIndex] === ImageQualityStatus.FULL_RESOLUTION) {
      // The request framework handles non-promise returns, so just return here
      return;
    }

    const uncompressedIterator = ProgressiveIterator.as(
      imageLoader.loadImage(imageId, options)
    );
    return uncompressedIterator.forEach((image) => {
      // scalarData is the volume container we are progressively loading into
      // image is the pixelData decoded from workers in cornerstoneDICOMImageLoader
      this.successCallback(imageId, image);
    }, this.errorCallback.bind(this, imageIdIndex, imageId));
  }

  protected getImageIdsRequests(imageIds: string[], priorityDefault: number) {
    // SharedArrayBuffer
    this.totalNumFrames = this.imageIds.length;
    const autoRenderPercentage = 2;

    if (this.autoRenderOnLoad) {
      this.reRenderFraction =
        this.totalNumFrames * (autoRenderPercentage / 100);
      this.reRenderTarget = this.reRenderFraction;
    }

    // 4D datasets load one time point at a time and the frameIndex is
    // the position of the imageId in the current time point while the
    // imageIdIndex is its absolute position in the array that contains
    // all other imageIds. In a 4D dataset the frameIndex can also be
    // calculated as `imageIdIndex % numFrames` where numFrames is the
    // number of frames per time point. The frameIndex and imageIdIndex
    // will be the same when working with 3D datasets.
    const requests = imageIds.map((imageId) => {
      const imageIdIndex = this.getImageIdIndex(imageId);

      const requestType = requestTypeDefault;
      const priority = priorityDefault;
      const options = this.getLoaderImageOptions(imageId);

      return {
        callLoadImage: this.callLoadImage.bind(this),
        imageId,
        imageIdIndex,
        options,
        priority,
        requestType,
        additionalDetails: {
          volumeId: this.volumeId,
        },
      };
    });

    return requests;
  }

  private handleImageComingFromCache(
    cachedImageOrVolume,
    isFromImageCache: boolean,
    scalingParameters,
    scalarData: Types.PixelDataTypedArray,
    frameIndex: number,
    arrayBuffer: ArrayBufferLike,
    imageIdIndex: number,
    imageId: string
  ) {
    const imageLoadObject = isFromImageCache
      ? cachedImageOrVolume.imageLoadObject
      : cachedImageOrVolume.convertToCornerstoneImage(imageId, imageIdIndex);

    imageLoadObject.promise
      .then((cachedImage) => {
        const imageScalarData = this._scaleIfNecessary(
          cachedImage,
          scalingParameters
        );
        // todo add scaling and slope
        const { pixelsPerImage, bytesPerImage } = this.cornerstoneImageMetaData;
        const TypedArray = scalarData.constructor;
        let byteOffset = bytesPerImage * frameIndex;

        // create a view on the volume arraybuffer
        const bytePerPixel = bytesPerImage / pixelsPerImage;

        if (scalarData.BYTES_PER_ELEMENT !== bytePerPixel) {
          byteOffset *= scalarData.BYTES_PER_ELEMENT / bytePerPixel;
        }

        // @ts-ignore
        const volumeBufferView = new TypedArray(
          arrayBuffer,
          byteOffset,
          pixelsPerImage
        );
        volumeBufferView.set(imageScalarData);
        this.updateTextureAndTriggerEvents(
          imageIdIndex,
          imageId,
          cachedImage.imageQualityStatus
        );
      })
      .catch((err) => {
        this.errorCallback(imageId, true, err);
      });
  }

  /**
   * It returns the imageLoad requests for the streaming image volume instance.
   * It involves getting all the imageIds of the volume and creating a success callback
   * which would update the texture (when the image has loaded) and the failure callback.
   * Note that this method does not executes the requests but only returns the requests.
   * It can be used for sorting requests outside of the volume loader itself
   * e.g. loading a single slice of CT, followed by a single slice of PET (interleaved), before
   * moving to the next slice.
   *
   * @returns Array of requests including imageId of the request, its imageIdIndex,
   * options (targetBuffer and scaling parameters), and additionalDetails (volumeId)
   */
  public getImageLoadRequests(_priority: number): any[] {
    throw new Error('Abstract method');
  }

  public getImageIdsToLoad(): string[] {
    throw new Error('Abstract method');
  }

  /**
   * Retrieves images using the older getImageLoadRequests method
   * to setup all the requests.  Ensures compatibility with the custom image
   * loaders.
   */
  public loadImages(imageIds: string[], listener: ImageLoadListener) {
    this.loadStatus.loading = true;

    const requests = this.getImageLoadRequests(5);

    requests.reverse().forEach((request) => {
      if (!request) {
        // there is a cached image for the imageId and no requests will fire
        return;
      }

      const {
        callLoadImage,
        imageId,
        imageIdIndex,
        options,
        priority,
        requestType,
        additionalDetails,
      } = request;

      imageLoadPoolManager.addRequest(
        callLoadImage.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority
      );
    });
    return Promise.resolve(true);
  }

  private _prefetchImageIds() {
    // Note: here is the correct location to set the loading flag
    // since getImageIdsRequest is just grabbing and building requests
    // and not actually executing them
    this.loadStatus.loading = true;

    const imageIds = [...this.getImageIdsToLoad()];
    imageIds.reverse();

    this.totalNumFrames = this.imageIds.length;
    const autoRenderPercentage = 2;

    if (this.autoRenderOnLoad) {
      this.reRenderFraction =
        this.totalNumFrames * (autoRenderPercentage / 100);
      this.reRenderTarget = this.reRenderFraction;
    }

    return this.imagesLoader.loadImages(imageIds, this).catch((e) => {
      console.debug('progressive loading failed to complete', e);
    });
  }

  /**
   * This function decides whether or not to scale the image based on the
   * scalingParameters. If the image is already scaled, we should take that
   * into account when scaling the image again, so if the rescaleSlope and/or
   * rescaleIntercept are different from the ones that were used to scale the
   * image, we should scale the image again according to the new parameters.
   */
  private _scaleIfNecessary(
    image,
    scalingParametersToUse: Types.ScalingParameters
  ) {
    if (!image.preScale?.enabled) {
      return image.getPixelData().slice(0);
    }

    const imageIsAlreadyScaled = image.preScale?.scaled;
    const noScalingParametersToUse =
      !scalingParametersToUse ||
      !scalingParametersToUse.rescaleIntercept ||
      !scalingParametersToUse.rescaleSlope;

    if (!imageIsAlreadyScaled && noScalingParametersToUse) {
      // no need to scale the image
      return image.getPixelData().slice(0);
    }

    if (
      !imageIsAlreadyScaled &&
      scalingParametersToUse &&
      scalingParametersToUse.rescaleIntercept !== undefined &&
      scalingParametersToUse.rescaleSlope !== undefined
    ) {
      // if not already scaled, just scale the image.
      // copy so that it doesn't get modified
      const pixelDataCopy = image.getPixelData().slice(0);
      const scaledArray = scaleArray(pixelDataCopy, scalingParametersToUse);
      return scaledArray;
    }

    // if the image is already scaled,
    const {
      rescaleSlope: rescaleSlopeToUse,
      rescaleIntercept: rescaleInterceptToUse,
      suvbw: suvbwToUse,
    } = scalingParametersToUse;

    const {
      rescaleSlope: rescaleSlopeUsed,
      rescaleIntercept: rescaleInterceptUsed,
      suvbw: suvbwUsed,
    } = image.preScale.scalingParameters;

    const rescaleSlopeIsSame = rescaleSlopeToUse === rescaleSlopeUsed;
    const rescaleInterceptIsSame =
      rescaleInterceptToUse === rescaleInterceptUsed;
    const suvbwIsSame = suvbwToUse === suvbwUsed;

    if (rescaleSlopeIsSame && rescaleInterceptIsSame && suvbwIsSame) {
      // if the scaling parameters are the same, we don't need to scale the image again
      return image.getPixelData();
    }

    const pixelDataCopy = image.getPixelData().slice(0);
    // the general formula for scaling is  scaledPixelValue = suvbw * (pixelValue * rescaleSlope) + rescaleIntercept
    const newSuvbw = suvbwToUse / suvbwUsed;
    const newRescaleSlope = rescaleSlopeToUse / rescaleSlopeUsed;
    const newRescaleIntercept =
      rescaleInterceptToUse - rescaleInterceptUsed * newRescaleSlope;

    const newScalingParameters = {
      ...scalingParametersToUse,
      rescaleSlope: newRescaleSlope,
      rescaleIntercept: newRescaleIntercept,
      suvbw: newSuvbw,
    };

    const scaledArray = scaleArray(pixelDataCopy, newScalingParameters);
    return scaledArray;
  }

  private _addScalingToVolume(suvFactor) {
    // Todo: handle case where suvFactors are not the same for all frames
    if (this.scaling) {
      return;
    }

    const { suvbw, suvlbm, suvbsa } = suvFactor;

    const petScaling = <Types.PTScaling>{};

    if (suvlbm) {
      petScaling.suvbwToSuvlbm = suvlbm / suvbw;
    }

    if (suvbsa) {
      petScaling.suvbwToSuvbsa = suvbsa / suvbw;
    }

    if (suvbw) {
      petScaling.suvbw = suvbw;
    }

    this.scaling = { PT: petScaling };
  }
}

function getScalarDataType(scalarData, numFrames) {
  let type, byteSize;
  if (scalarData instanceof Uint8Array) {
    type = 'Uint8Array';
    byteSize = 1;
  } else if (scalarData instanceof Float32Array) {
    type = 'Float32Array';
    byteSize = 4;
  } else if (scalarData instanceof Uint16Array) {
    type = 'Uint16Array';
    byteSize = 2;
  } else if (scalarData instanceof Int16Array) {
    type = 'Int16Array';
    byteSize = 2;
  } else {
    throw new Error('Unsupported array type');
  }
  const length = scalarData.length / numFrames;
  const lengthInBytes = length * byteSize;
  return { type, byteSize, length, lengthInBytes };
}

/**
 * Sets the scalar data at the appropriate offset to the
 * byte data from the image.
 */
function handleArrayBufferLoad(scalarData, image, options) {
  if (!(scalarData.buffer instanceof ArrayBuffer)) {
    return;
  }
  const offset = options.targetBuffer.offset; // in bytes
  const length = options.targetBuffer.length; // in frames
  const pixelData = image.pixelData ? image.pixelData : image.getPixelData();

  try {
    if (scalarData instanceof Float32Array) {
      const bytesInFloat = 4;
      const floatView = new Float32Array(pixelData);
      if (floatView.length !== length) {
        throw 'Error pixelData length does not match frame length';
      }
      // since set is based on the underlying type,
      // we need to divide the offset bytes by the byte type
      scalarData.set(floatView, offset / bytesInFloat);
    }
    if (scalarData instanceof Int16Array) {
      const bytesInInt16 = 2;
      const intView = new Int16Array(pixelData);
      if (intView.length !== length) {
        throw 'Error pixelData length does not match frame length';
      }
      scalarData.set(intView, offset / bytesInInt16);
    }
    if (scalarData instanceof Uint16Array) {
      const bytesInUint16 = 2;
      const intView = new Uint16Array(pixelData);
      if (intView.length !== length) {
        throw 'Error pixelData length does not match frame length';
      }
      scalarData.set(intView, offset / bytesInUint16);
    }
    if (scalarData instanceof Uint8Array) {
      const bytesInUint8 = 1;
      const intView = new Uint8Array(pixelData);
      if (intView.length !== length) {
        throw 'Error pixelData length does not match frame length';
      }
      scalarData.set(intView, offset / bytesInUint8);
    }
  } catch (e) {
    console.error(e);
  }
}
