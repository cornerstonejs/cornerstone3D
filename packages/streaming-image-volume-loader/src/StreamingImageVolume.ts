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
} from '@cornerstonejs/core';

import type { Types } from '@cornerstonejs/core';
import { scaleArray, autoLoad } from './helpers';

const requestType = Enums.RequestType.Prefetch;
const { getMinMax } = csUtils;

/**
 * Streaming Image Volume Class that extends ImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingImageVolume extends ImageVolume {
  private _cornerstoneImageMetaData;

  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cachedFrames: Array<boolean>;
    callbacks: Array<(...args: unknown[]) => void>;
  };

  constructor(
    imageVolumeProperties: Types.IVolume,
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties);
    this.imageIds = streamingProperties.imageIds;
    this.loadStatus = streamingProperties.loadStatus;

    this._createCornerstoneImageMetaData();
  }

  /**
   * Creates the metadata required for converting the volume to an cornerstoneImage
   */
  private _createCornerstoneImageMetaData() {
    const numImages = this.imageIds.length;
    const bytesPerImage = this.sizeInBytes / numImages;
    const numComponents = this.scalarData.length / this.numVoxels;
    const pixelsPerImage =
      this.dimensions[0] * this.dimensions[1] * numComponents;

    const { PhotometricInterpretation, voiLut, VOILUTFunction } = this.metadata;

    let windowCenter = [];
    let windowWidth = [];

    if (voiLut && voiLut.length) {
      windowCenter = voiLut.map((voi) => {
        return voi.windowCenter;
      });

      windowWidth = voiLut.map((voi) => {
        return voi.windowWidth;
      });
    }

    const color = numComponents > 1 ? true : false; //todo: fix this

    this._cornerstoneImageMetaData = {
      bytesPerImage,
      numComponents,
      pixelsPerImage,
      windowCenter,
      windowWidth,
      color,
      spacing: this.spacing,
      dimensions: this.dimensions,
      PhotometricInterpretation,
      voiLUTFunction: VOILUTFunction,
      invert: PhotometricInterpretation === 'MONOCHROME1',
    };
  }

  private _hasLoaded = (): boolean => {
    const { loadStatus, imageIds } = this;
    const numFrames = imageIds.length;

    for (let i = 0; i < numFrames; i++) {
      if (!loadStatus.cachedFrames[i]) {
        return false;
      }
    }

    return true;
  };

  /**
   * It cancels loading the images of the volume. It sets the loading status to false
   * and filters any imageLoad request in the requestPoolManager that has the same
   * volumeId
   */
  public cancelLoading = () => {
    const { loadStatus } = this;

    if (!loadStatus || !loadStatus.loading) {
      return;
    }

    // Set to not loading.
    loadStatus.loading = false;

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

  /**
   * It triggers a prefetch for images in the volume.
   * @param callback - A callback function to be called when the volume is fully loaded
   * @param priority - The priority for loading the volume images, lower number is higher priority
   * @returns
   */
  public load = (
    callback: (...args: unknown[]) => void,
    priority = 5
  ): void => {
    const { imageIds, loadStatus } = this;

    if (loadStatus.loading === true) {
      console.log(
        `loadVolume: Loading is already in progress for ${this.volumeId}`
      );
      return; // Already loading, will get callbacks from main load.
    }

    const { loaded } = this.loadStatus;
    const numFrames = imageIds.length;

    if (loaded) {
      if (callback) {
        callback({
          success: true,
          framesLoaded: numFrames,
          numFrames,
          framesProcessed: numFrames,
        });
      }
      return;
    }

    if (callback) {
      this.loadStatus.callbacks.push(callback);
    }

    this._prefetchImageIds(priority);
  };

  /**
   * It returns the imageLoad requests for the streaming image volume instance.
   * It involves getting all the imageIds of the volume and creating a success callback
   * which would update the texture (when the image has loaded) and the failure callback.
   * Note that this method does not run executes the requests but only returns the requests.
   * It can be used for sorting requests outside of the volume loader itself
   * e.g. loading a single slice of CT, followed by a single slice of PET (interleaved), before
   * moving to the next slice.
   *
   * @returns Array of requests including imageId of the request, its imageIdIndex,
   * options (targetBuffer and scaling parameters), and additionalDetails (volumeId)
   */
  public getImageLoadRequests = (priority: number) => {
    const { scalarData, loadStatus } = this;
    const { cachedFrames } = loadStatus;

    const { imageIds, vtkOpenGLTexture, imageData, metadata, volumeId } = this;
    const { FrameOfReferenceUID } = metadata;
    loadStatus.loading = true;

    // SharedArrayBuffer
    const arrayBuffer = scalarData.buffer;
    const numFrames = imageIds.length;

    // Length of one frame in voxels
    const length = scalarData.length / numFrames;
    // Length of one frame in bytes
    const lengthInBytes = arrayBuffer.byteLength / numFrames;

    let type;

    if (scalarData instanceof Uint8Array) {
      type = 'Uint8Array';
    } else if (scalarData instanceof Float32Array) {
      type = 'Float32Array';
    } else {
      throw new Error('Unsupported array type');
    }

    let framesLoaded = 0;
    let framesProcessed = 0;

    const autoRenderOnLoad = true;
    const autoRenderPercentage = 2;

    let reRenderFraction;
    let reRenderTarget;

    if (autoRenderOnLoad) {
      reRenderFraction = numFrames * (autoRenderPercentage / 100);
      reRenderTarget = reRenderFraction;
    }

    function callLoadStatusCallback(evt) {
      // TODO: probably don't want this here
      if (autoRenderOnLoad) {
        if (
          evt.framesProcessed > reRenderTarget ||
          evt.framesProcessed === evt.numFrames
        ) {
          reRenderTarget += reRenderFraction;

          autoLoad(volumeId);
        }
      }

      if (evt.framesProcessed === evt.numFrames) {
        loadStatus.callbacks.forEach((callback) => callback(evt));
      }
    }

    const successCallback = (
      imageIdIndex: number,
      imageId: string,
      scalingParameters
    ) => {
      // Check if there is a cached image for the same imageURI (different
      // data loader scheme)
      const cachedImage = cache.getCachedImageBasedOnImageURI(imageId);

      // check if we are still loading the volume and we have not canceled loading
      if (!loadStatus.loading) {
        return;
      }

      if (!cachedImage || !cachedImage.image) {
        return updateTextureAndTriggerEvents(this, imageIdIndex, imageId);
      }
      const imageScalarData = this._scaleIfNecessary(
        cachedImage.image,
        scalingParameters
      );
      // todo add scaling and slope
      const { pixelsPerImage, bytesPerImage } = this._cornerstoneImageMetaData;
      const TypedArray = this.scalarData.constructor;
      let byteOffset = bytesPerImage * imageIdIndex;

      //    create a view on the volume arraybuffer
      const bytePerPixel = bytesPerImage / pixelsPerImage;

      if (this.scalarData.BYTES_PER_ELEMENT !== bytePerPixel) {
        byteOffset *= this.scalarData.BYTES_PER_ELEMENT / bytePerPixel;
      }

      // @ts-ignore
      const volumeBufferView = new TypedArray(
        arrayBuffer,
        byteOffset,
        pixelsPerImage
      );
      cachedImage.imageLoadObject.promise
        .then((image) => {
          volumeBufferView.set(imageScalarData);
          updateTextureAndTriggerEvents(this, imageIdIndex, imageId);
        })
        .catch((err) => {
          errorCallback(err, imageIdIndex, imageId);
        });
      return;
    };

    function updateTextureAndTriggerEvents(
      volume: StreamingImageVolume,
      imageIdIndex,
      imageId
    ) {
      cachedFrames[imageIdIndex] = true;
      framesLoaded++;
      framesProcessed++;

      vtkOpenGLTexture.setUpdatedFrame(imageIdIndex);
      imageData.modified();

      const eventDetail: Types.EventTypes.ImageVolumeModifiedEventDetail = {
        FrameOfReferenceUID,
        imageVolume: volume,
      };

      triggerEvent(
        eventTarget,
        Enums.Events.IMAGE_VOLUME_MODIFIED,
        eventDetail
      );

      if (framesProcessed === numFrames) {
        loadStatus.loaded = true;
        loadStatus.loading = false;

        // TODO: Should we remove the callbacks in favour of just using events?
        callLoadStatusCallback({
          success: true,
          imageIdIndex,
          imageId,
          framesLoaded,
          framesProcessed,
          numFrames,
        });
        loadStatus.callbacks = [];
      } else {
        callLoadStatusCallback({
          success: true,
          imageIdIndex,
          imageId,
          framesLoaded,
          framesProcessed,
          numFrames,
        });
      }
    }

    function errorCallback(error, imageIdIndex, imageId) {
      framesProcessed++;

      if (framesProcessed === numFrames) {
        loadStatus.loaded = true;
        loadStatus.loading = false;

        callLoadStatusCallback({
          success: false,
          imageId,
          imageIdIndex,
          error,
          framesLoaded,
          framesProcessed,
          numFrames,
        });

        loadStatus.callbacks = [];
      } else {
        callLoadStatusCallback({
          success: false,
          imageId,
          imageIdIndex,
          error,
          framesLoaded,
          framesProcessed,
          numFrames,
        });
      }

      const eventDetail = {
        error,
        imageIdIndex,
        imageId,
      };

      triggerEvent(eventTarget, Enums.Events.IMAGE_LOAD_ERROR, eventDetail);
    }

    function handleArrayBufferLoad(scalarData, image, options) {
      if (!(scalarData.buffer instanceof ArrayBuffer)) {
        return;
      }

      const offset = options.targetBuffer.offset; // in bytes
      const length = options.targetBuffer.length; // in frames
      try {
        if (scalarData instanceof Float32Array) {
          const bytesInFloat = 4;
          const floatView = new Float32Array(image.pixelData);
          if (floatView.length !== length) {
            throw 'Error pixelData length does not match frame length';
          }
          scalarData.set(floatView, offset / bytesInFloat);
        }
        if (scalarData instanceof Uint8Array) {
          const bytesInUint8 = 1;
          const intView = new Uint8Array(image.pixelData);
          if (intView.length !== length) {
            throw 'Error pixelData length does not match frame length';
          }
          scalarData.set(intView, offset / bytesInUint8);
        }
      } catch (e) {
        console.error(e);
      }
    }

    const requests = imageIds.map((imageId, imageIdIndex) => {
      if (cachedFrames[imageIdIndex]) {
        framesLoaded++;
        framesProcessed++;
        return;
      }

      const modalityLutModule =
        metaData.get('modalityLutModule', imageId) || {};

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

      const options = {
        // WADO Image Loader
        targetBuffer: {
          // keeping this in the options means a large empty volume array buffer
          // will be transferred to the worker. This is undesirable for streaming
          // volume without shared array buffer because the target is now an empty
          // 300-500MB volume array buffer. Instead the volume should be progressively
          // set in the main thread.
          arrayBuffer:
            arrayBuffer instanceof ArrayBuffer ? undefined : arrayBuffer,
          offset: imageIdIndex * lengthInBytes,
          length,
          type,
        },
        skipCreateImage: true,
        preScale: {
          enabled: true,
          // we need to pass in the scalingParameters here, since the streaming
          // volume loader doesn't go through the createImage phase in the loader,
          // and therefore doesn't have the scalingParameters
          scalingParameters,
        },
      };

      // Use loadImage because we are skipping the Cornerstone Image cache
      // when we load directly into the Volume cache
      const callLoadImage = (imageId, imageIdIndex, options) => {
        return imageLoader.loadImage(imageId, options).then(
          (image) => {
            // scalarData is the volume container we are progressively loading into
            // image is the pixelData decoded from workers in cornerstoneWADOImageLoader
            const scalarData = this.scalarData;
            handleArrayBufferLoad(scalarData, image, options);
            successCallback(imageIdIndex, imageId, scalingParameters);
          },
          (error) => {
            errorCallback(error, imageIdIndex, imageId);
          }
        );
      };

      return {
        callLoadImage,
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
  };

  private _prefetchImageIds(priority: number) {
    const requests = this.getImageLoadRequests(priority);

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

    this.scaling = { PET: petScaling };
    this.isPrescaled = true;
  }

  private _removeFromCache() {
    // TODO: not 100% sure this is the same Id as the volume loader's volumeId?
    // so I have no idea if this will work
    cache.removeVolumeLoadObject(this.volumeId);
  }

  /**
   * Converts the requested imageId inside the volume to a cornerstoneImage
   * object. It uses the typedArray set method to copy the pixelData from the
   * correct offset in the scalarData to a new array for the image
   *
   * @param imageId - the imageId of the image to be converted
   * @param imageIdIndex - the index of the imageId in the imageIds array
   * @returns imageLoadObject containing the promise that resolves
   * to the cornerstone image
   */
  public convertToCornerstoneImage(
    imageId: string,
    imageIdIndex: number
  ): Types.IImageLoadObject {
    const { imageIds } = this;

    const {
      bytesPerImage,
      pixelsPerImage,
      windowCenter,
      windowWidth,
      numComponents,
      color,
      dimensions,
      spacing,
      invert,
      voiLUTFunction,
    } = this._cornerstoneImageMetaData;

    // 1. Grab the buffer and it's type
    const volumeBuffer = this.scalarData.buffer;
    // (not sure if this actually works, TypeScript keeps complaining)
    const TypedArray = this.scalarData.constructor;

    // 2. Given the index of the image and frame length in bytes,
    //    create a view on the volume arraybuffer
    const bytePerPixel = bytesPerImage / pixelsPerImage;

    let byteOffset = bytesPerImage * imageIdIndex;

    // If there is a discrepancy between the volume typed array
    // and the bitsAllocated for the image. The reason is that VTK uses Float32
    // on the GPU and if the type is not Float32, it will convert it. So for not
    // having a performance issue, we convert all types initially to Float32 even
    // if they are not Float32.
    if (this.scalarData.BYTES_PER_ELEMENT !== bytePerPixel) {
      byteOffset *= this.scalarData.BYTES_PER_ELEMENT / bytePerPixel;
    }

    // 3. Create a new TypedArray of the same type for the new
    //    Image that will be created
    // @ts-ignore
    const imageScalarData = new TypedArray(pixelsPerImage);
    // @ts-ignore
    const volumeBufferView = new TypedArray(
      volumeBuffer,
      byteOffset,
      pixelsPerImage
    );

    // 4. Use e.g. TypedArray.set() to copy the data from the larger
    //    buffer's view into the smaller one
    imageScalarData.set(volumeBufferView);

    // 5. Create an Image Object from imageScalarData and put it into the Image cache
    const volumeImageId = imageIds[imageIdIndex];
    const modalityLutModule =
      metaData.get('modalityLutModule', volumeImageId) || {};
    const minMax = getMinMax(imageScalarData);
    const intercept = modalityLutModule.rescaleIntercept
      ? modalityLutModule.rescaleIntercept
      : 0;

    const image: Types.IImage = {
      imageId,
      intercept,
      windowCenter,
      windowWidth,
      voiLUTFunction,
      color,
      numComps: numComponents,
      rows: dimensions[0],
      columns: dimensions[1],
      sizeInBytes: imageScalarData.byteLength,
      getPixelData: () => imageScalarData,
      minPixelValue: minMax.min,
      maxPixelValue: minMax.max,
      slope: modalityLutModule.rescaleSlope
        ? modalityLutModule.rescaleSlope
        : 1,
      getCanvas: undefined, // todo: which canvas?
      height: dimensions[0],
      width: dimensions[1],
      rgba: undefined, // todo: how
      columnPixelSpacing: spacing[0],
      rowPixelSpacing: spacing[1],
      invert,
    };

    // 5. Create the imageLoadObject
    const imageLoadObject = {
      promise: Promise.resolve(image),
    };

    return imageLoadObject;
  }

  /**
   * Converts all the volume images (imageIds) to cornerstoneImages and caches them.
   * It iterates over all the imageIds and convert them until there is no
   * enough space left inside the imageCache. Finally it will decache the Volume.
   *
   */
  private _convertToImages() {
    // 1. Try to decache images in the volatile Image Cache to provide
    //    enough space to store another entire copy of the volume (as Images).
    //    If we do not have enough, we will store as many images in the cache
    //    as possible, and the rest of the volume will be decached.
    const byteLength = this.sizeInBytes;
    const numImages = this.imageIds.length;
    const { bytesPerImage } = this._cornerstoneImageMetaData;

    let bytesRemaining = cache.decacheIfNecessaryUntilBytesAvailable(
      byteLength,
      this.imageIds
    );

    for (let imageIdIndex = 0; imageIdIndex < numImages; imageIdIndex++) {
      const imageId = this.imageIds[imageIdIndex];

      bytesRemaining = bytesRemaining - bytesPerImage;

      // 2. Convert each imageId to a cornerstone Image object which is
      // resolved inside the promise of imageLoadObject
      const imageLoadObject = this.convertToCornerstoneImage(
        imageId,
        imageIdIndex
      );

      // 3. Caching the image
      cache.putImageLoadObject(imageId, imageLoadObject).catch((err) => {
        console.error(err);
      });

      // 4. If we know we won't be able to add another Image to the cache
      //    without breaching the limit, stop here.
      if (bytesRemaining <= bytesPerImage) {
        break;
      }
    }
    // 5. When as much of the Volume is processed into Images as possible
    //    without breaching the cache limit, remove the Volume
    this._removeFromCache();
  }

  /**
   * If completelyRemove is true, remove the volume completely from the cache. Otherwise,
   * convert the volume to cornerstone images (stack images) and store it in the cache
   * @param completelyRemove - If true, the image will be removed from the
   * cache completely.
   */
  public decache(completelyRemove = false): void {
    if (completelyRemove) {
      this._removeFromCache();
    } else {
      this._convertToImages();
    }
  }
}
