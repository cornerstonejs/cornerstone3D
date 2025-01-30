import * as metaData from '../../metaData';
import { Events, ImageQualityStatus, RequestType } from '../../enums';
import eventTarget from '../../eventTarget';
import imageLoadPoolManager from '../../requestPool/imageLoadPoolManager';
import type {
  IImagesLoader,
  ImageLoadRequests,
  ImageVolumeProps,
  IStreamingVolumeProperties,
  PTScaling,
  ScalingParameters,
} from '../../types';
import ProgressiveIterator from '../../utilities/ProgressiveIterator';
import imageRetrieveMetadataProvider from '../../utilities/imageRetrieveMetadataProvider';
import { hasFloatScalingParameters } from '../../utilities/hasFloatScalingParameters';
import autoLoad from '../../utilities/autoLoad';
import triggerEvent from '../../utilities/triggerEvent';
import ImageVolume from './ImageVolume';
import ProgressiveRetrieveImages from '../../loaders/ProgressiveRetrieveImages';
import { canRenderFloatTextures } from '../../init';
import { loadAndCacheImage } from '../../loaders/imageLoader';
const requestTypeDefault = RequestType.Prefetch;

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
    imageVolumeProperties: ImageVolumeProps,
    streamingProperties: IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties);
    this.loadStatus = streamingProperties.loadStatus;
  }

  protected invalidateVolume(immediate: boolean): void {
    const { vtkOpenGLTexture } = this;
    const { numFrames } = this;

    for (let i = 0; i < numFrames; i++) {
      vtkOpenGLTexture.setUpdatedFrame(i);
    }

    this.modified();

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
        Events.IMAGE_VOLUME_LOADING_COMPLETED,
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

    const eventDetail = {
      FrameOfReferenceUID,
      volumeId: this.volumeId,
      numberOfFrames: numFrames,
      framesProcessed: this.framesProcessed,
    };

    triggerEvent(eventTarget, Events.IMAGE_VOLUME_MODIFIED, eventDetail);

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

    this.vtkOpenGLTexture.setUpdatedFrame(frameIndex);

    if (this.loadStatus.loaded) {
      this.loadStatus.callbacks = [];
    }
  }

  public successCallback(imageId: string, image) {
    const imageIdIndex = this.getImageIdIndex(imageId);
    const { imageQualityStatus } = image;

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
    this.updateTextureAndTriggerEvents(
      imageIdIndex,
      imageId,
      imageQualityStatus
    );

    // Check if this completes a timepoint (for dynamic volumes)
    if (this.isDynamicVolume()) {
      this.checkDimensionGroupCompletion(imageIdIndex);
    }
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

    triggerEvent(eventTarget, Events.IMAGE_LOAD_ERROR, eventDetail);
  }

  /**
   * It triggers a prefetch for images in the volume.
   * @param callback - A callback function to be called when the volume is fully loaded
   * @param priority - The priority for loading the volume images, lower number is higher priority
   * @returns
   */
  public load(callback: (...args: unknown[]) => void): void {
    const { imageIds, loadStatus, numFrames } = this;
    const { transferSyntaxUID } =
      metaData.get('transferSyntax', imageIds[0]) || {};
    const imageRetrieveConfiguration = metaData.get(
      imageRetrieveMetadataProvider.IMAGE_RETRIEVE_CONFIGURATION,
      this.volumeId,
      transferSyntaxUID,
      'volume'
    );

    this.imagesLoader = this.isDynamicVolume()
      ? this
      : imageRetrieveConfiguration
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
  }

  public getLoaderImageOptions(imageId: string) {
    const { transferSyntaxUID: transferSyntaxUID } =
      metaData.get('transferSyntax', imageId) || {};

    const imagePlaneModule = metaData.get('imagePlaneModule', imageId) || {};
    const { rows, columns } = imagePlaneModule;
    const imageIdIndex = this.getImageIdIndex(imageId);

    const modalityLutModule = metaData.get('modalityLutModule', imageId) || {};

    const generalSeriesModule =
      metaData.get('generalSeriesModule', imageId) || {};

    const scalingParameters: ScalingParameters = {
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
    this.isPreScaled = true;

    if (
      scalingParameters &&
      scalingParameters.rescaleSlope !== undefined &&
      scalingParameters.rescaleIntercept !== undefined
    ) {
      const { rescaleSlope, rescaleIntercept } = scalingParameters;
      this.isPreScaled =
        typeof rescaleSlope === 'number' &&
        typeof rescaleIntercept === 'number';
    }

    // in case where the hardware/os does not support float rendering but the
    // requested scaling params are not integers, we need to disable pre-scaling
    if (!allowFloatRendering && floatAfterScale) {
      this.isPreScaled = false;
    }

    const targetBuffer = {
      type: this.dataType,
      rows,
      columns,
    };

    return {
      // WADO Image Loader
      targetBuffer,
      allowFloatRendering,
      preScale: {
        enabled: this.isPreScaled,
        // we need to pass in the scalingParameters here, since the streaming
        // volume loader doesn't go through the createImage phase in the loader,
        // and therefore doesn't have the scalingParameters
        scalingParameters,
      },
      transferPixelData: true,
      requestType: requestTypeDefault,
      transferSyntaxUID,
      // The loader is used to load the image into the cache
      // loader: imageLoader.loadAndCacheImage,
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

    // Todo: check if this needs more work for when we have progressive loading
    const handleImageCacheAdded = (event) => {
      const { image } = event.detail;
      if (image.imageId === imageId) {
        this.vtkOpenGLTexture.setUpdatedFrame(imageIdIndex);
        // Remove the event listener after it's been triggered
        eventTarget.removeEventListener(
          Events.IMAGE_CACHE_IMAGE_ADDED,
          handleImageCacheAdded
        );
      }
    };

    eventTarget.addEventListener(
      Events.IMAGE_CACHE_IMAGE_ADDED,
      handleImageCacheAdded
    );

    const uncompressedIterator = ProgressiveIterator.as(
      loadAndCacheImage(imageId, options)
    );

    return uncompressedIterator.forEach((image) => {
      // scalarData is the volume container we are progressively loading into
      // image is the pixelData decoded from workers in cornerstoneDICOMImageLoader
      this.successCallback(imageId, image);
    }, this.errorCallback.bind(this, imageIdIndex, imageId));
  }

  protected getImageIdsRequests(imageIds: string[], priorityDefault: number) {
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
  public getImageLoadRequests(priority: number): ImageLoadRequests[] {
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
  public loadImages() {
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

  private _addScalingToVolume(suvFactor) {
    // Todo: handle case where suvFactors are not the same for all frames
    if (this.scaling) {
      return;
    }

    const { suvbw, suvlbm, suvbsa } = suvFactor;

    const petScaling = <PTScaling>{};

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

  protected checkDimensionGroupCompletion(imageIdIndex: number): void {}
}
