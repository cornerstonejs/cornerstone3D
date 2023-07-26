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
 *
 */
export default class BaseStreamingImageVolume extends ImageVolume {
  private framesLoaded = 0;
  private framesProcessed = 0;
  protected numFrames: number;
  protected cornerstoneImageMetaData = null;

  loadStatus: {
    loaded: boolean;
    loading: boolean;
    cancelled: boolean;
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
    this.numFrames = this._getNumFrames();

    this._createCornerstoneImageMetaData();
  }

  /**
   * Returns the number of frames stored in a scalarData object. The number of
   * frames is equal to the number of images for 3D volumes or the number of
   * frames per time poins for 4D volumes.
   * @returns number of frames per volume
   */
  private _getNumFrames(): number {
    const { imageIds, scalarData } = this;
    const scalarDataCount = this.isDynamicVolume() ? scalarData.length : 1;

    return imageIds.length / scalarDataCount;
  }

  private _getScalarDataLength(): number {
    const { scalarData } = this;
    return this.isDynamicVolume()
      ? (<Types.VolumeScalarData[]>scalarData)[0].length
      : (<Types.VolumeScalarData>scalarData).length;
  }

  /**
   * Creates the metadata required for converting the volume to an cornerstoneImage
   */
  private _createCornerstoneImageMetaData() {
    const { numFrames } = this;

    if (numFrames === 0) {
      return;
    }

    const bytesPerImage = this.sizeInBytes / numFrames;
    const scalarDataLength = this._getScalarDataLength();
    const numComponents = scalarDataLength / this.numVoxels;
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

    this.cornerstoneImageMetaData = {
      bytesPerImage,
      numComponents,
      pixelsPerImage,
      windowCenter,
      windowWidth,
      color,
      // we use rgb (3 components) for the color volumes (and not rgba), and not rgba (which is used
      // in some parts of the lib for stack viewing in CPU)
      rgba: false,
      spacing: this.spacing,
      dimensions: this.dimensions,
      PhotometricInterpretation,
      voiLUTFunction: VOILUTFunction,
      invert: PhotometricInterpretation === 'MONOCHROME1',
    };
  }

  /**
   * Converts imageIdIndex into frameIndex which will be the same
   * for 3D volumes but different for 4D volumes
   */
  private _imageIdIndexToFrameIndex(imageIdIndex: number): number {
    return imageIdIndex % this.numFrames;
  }

  /**
   * Return all scalar data objects (buffers) which will be only one for
   * 3D volumes and one per time point for 4D volumes
   * images of each 3D volume is stored
   * @returns scalar data array
   */
  public getScalarDataArrays(): Types.VolumeScalarData[] {
    return this.isDynamicVolume()
      ? <Types.VolumeScalarData[]>this.scalarData
      : [<Types.VolumeScalarData>this.scalarData];
  }

  private _getScalarDataByImageIdIndex(
    imageIdIndex: number
  ): Types.VolumeScalarData {
    if (imageIdIndex < 0 || imageIdIndex >= this.imageIds.length) {
      throw new Error('imageIdIndex out of range');
    }

    const scalarDataArrays = this.getScalarDataArrays();
    const scalarDataIndex = Math.floor(imageIdIndex / this.numFrames);

    return scalarDataArrays[scalarDataIndex];
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
    const { imageIds, loadStatus, numFrames } = this;

    if (loadStatus.loading === true) {
      console.log(
        `loadVolume: Loading is already in progress for ${this.volumeId}`
      );
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

    this._prefetchImageIds(priority);
  };

  protected getImageIdsRequests = (
    imageIds: string[],
    scalarData: Types.VolumeScalarData,
    priority: number
  ) => {
    const { loadStatus } = this;
    const { cachedFrames } = loadStatus;

    const { vtkOpenGLTexture, imageData, metadata, volumeId } = this;
    const { FrameOfReferenceUID } = metadata;

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
    } else if (scalarData instanceof Uint16Array) {
      type = 'Uint16Array';
    } else if (scalarData instanceof Int16Array) {
      type = 'Int16Array';
    } else {
      throw new Error('Unsupported array type');
    }

    const totalNumFrames = this.imageIds.length;
    const autoRenderOnLoad = true;
    const autoRenderPercentage = 2;

    let reRenderFraction;
    let reRenderTarget;

    if (autoRenderOnLoad) {
      reRenderFraction = totalNumFrames * (autoRenderPercentage / 100);
      reRenderTarget = reRenderFraction;
    }

    function callLoadStatusCallback(evt) {
      // TODO: probably don't want this here

      if (autoRenderOnLoad) {
        if (
          evt.framesProcessed > reRenderTarget ||
          evt.framesProcessed === evt.totalNumFrames
        ) {
          reRenderTarget += reRenderFraction;
          autoLoad(volumeId);
        }
      }

      if (evt.framesProcessed === evt.totalNumFrames) {
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

    const successCallback = (
      imageIdIndex: number,
      imageId: string,
      scalingParameters
    ) => {
      const frameIndex = this._imageIdIndexToFrameIndex(imageIdIndex);

      // Check if there is a cached image for the same imageURI (different
      // data loader scheme)
      const cachedImage = cache.getCachedImageBasedOnImageURI(imageId);

      // check if the load was cancelled while we were waiting for the image
      // if so we don't want to do anything
      if (loadStatus.cancelled) {
        console.warn(
          'volume load cancelled, returning for imageIdIndex: ',
          imageIdIndex
        );
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
      cachedImage.imageLoadObject.promise
        .then((image) => {
          volumeBufferView.set(imageScalarData);
          updateTextureAndTriggerEvents(this, imageIdIndex, imageId);
        })
        .catch((err) => {
          errorCallback.call(this, err, imageIdIndex, imageId);
        });
      return;
    };

    const updateTextureAndTriggerEvents = (
      volume: BaseStreamingImageVolume,
      imageIdIndex,
      imageId
    ) => {
      const frameIndex = this._imageIdIndexToFrameIndex(imageIdIndex);

      cachedFrames[imageIdIndex] = true;
      this.framesLoaded++;
      this.framesProcessed++;

      vtkOpenGLTexture.setUpdatedFrame(frameIndex);
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

      if (this.framesProcessed === totalNumFrames) {
        loadStatus.loaded = true;
        loadStatus.loading = false;

        // TODO: Should we remove the callbacks in favour of just using events?
        callLoadStatusCallback({
          success: true,
          imageIdIndex,
          imageId,
          framesLoaded: this.framesLoaded,
          framesProcessed: this.framesProcessed,
          numFrames,
          totalNumFrames,
        });
        loadStatus.callbacks = [];
      } else {
        callLoadStatusCallback({
          success: true,
          imageIdIndex,
          imageId,
          framesLoaded: this.framesLoaded,
          framesProcessed: this.framesProcessed,
          numFrames,
          totalNumFrames,
        });
      }
    };

    function errorCallback(error, imageIdIndex, imageId) {
      this.framesProcessed++;

      if (this.framesProcessed === totalNumFrames) {
        loadStatus.loaded = true;
        loadStatus.loading = false;

        callLoadStatusCallback({
          success: false,
          imageId,
          imageIdIndex,
          error,
          framesLoaded: this.framesLoaded,
          framesProcessed: this.framesProcessed,
          numFrames,
          totalNumFrames,
        });

        loadStatus.callbacks = [];
      } else {
        callLoadStatusCallback({
          success: false,
          imageId,
          imageIdIndex,
          error,
          framesLoaded: this.framesLoaded,
          framesProcessed: this.framesProcessed,
          numFrames,
          totalNumFrames,
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
      const pixelData = image.pixelData
        ? image.pixelData
        : image.getPixelData();

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

    // 4D datasets load one time point at a time and the frameIndex is
    // the position of the imageId in the current time point while the
    // imageIdIndex is its absolute position in the array that contains
    // all other imageIds. In a 4D dataset the frameIndex can also be
    // calculated as `imageIdIndex % numFrames` where numFrames is the
    // number of frames per time point. The frameIndex and imageIdIndex
    // will be the same when working with 3D datasets.
    const requests = imageIds.map((imageId, frameIndex) => {
      const imageIdIndex = this.getImageIdIndex(imageId);

      if (cachedFrames[imageIdIndex]) {
        this.framesLoaded++;
        this.framesProcessed++;
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

      const isSlopeAndInterceptNumbers =
        typeof scalingParameters.rescaleSlope === 'number' &&
        typeof scalingParameters.rescaleIntercept === 'number';

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
          offset: frameIndex * lengthInBytes,
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
            // image is the pixelData decoded from workers in cornerstoneDICOMImageLoader
            handleArrayBufferLoad(scalarData, image, options);
            successCallback(imageIdIndex, imageId, scalingParameters);
          },
          (error) => {
            errorCallback.call(this, error, imageIdIndex, imageId);
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

  private _prefetchImageIds(priority: number): void {
    // Note: here is the correct location to set the loading flag
    // since getImageIdsRequest is just grabbing and building requests
    // and not actually executing them
    this.loadStatus.loading = true;

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

    if (suvbw) {
      petScaling.suvbw = suvbw;
    }

    this.scaling = { PT: petScaling };
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
    const frameIndex = this._imageIdIndexToFrameIndex(imageIdIndex);

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
    } = this.cornerstoneImageMetaData;

    // 1. Grab the buffer and it's type
    const scalarData = this._getScalarDataByImageIdIndex(imageIdIndex);
    const volumeBuffer = scalarData.buffer;
    // (not sure if this actually works, TypeScript keeps complaining)
    const TypedArray = scalarData.constructor;

    // 2. Given the index of the image and frame length in bytes,
    //    create a view on the volume arraybuffer
    const bytePerPixel = bytesPerImage / pixelsPerImage;

    let byteOffset = bytesPerImage * frameIndex;

    // If there is a discrepancy between the volume typed array
    // and the bitsAllocated for the image. The reason is that VTK uses Float32
    // on the GPU and if the type is not Float32, it will convert it. So for not
    // having a performance issue, we convert all types initially to Float32 even
    // if they are not Float32.
    if (scalarData.BYTES_PER_ELEMENT !== bytePerPixel) {
      byteOffset *= scalarData.BYTES_PER_ELEMENT / bytePerPixel;
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
      rgba: false,
      numComps: numComponents,
      // Note the dimensions were defined as [Columns, Rows, Frames]
      rows: dimensions[1],
      columns: dimensions[0],
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
    const { bytesPerImage } = this.cornerstoneImageMetaData;

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
      if (!cache.getImageLoadObject(imageId)) {
        cache.putImageLoadObject(imageId, imageLoadObject).catch((err) => {
          console.error(err);
        });
      }

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
