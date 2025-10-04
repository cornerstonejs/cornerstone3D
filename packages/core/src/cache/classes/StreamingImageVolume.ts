import type {
  ImageLoadRequests,
  ImageVolumeProps,
  IStreamingVolumeProperties,
  PixelDataTypedArray,
  IImage,
} from '../../types';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';

/**
 * Streaming Image Volume Class that extends ImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingImageVolume extends BaseStreamingImageVolume {
  private imagePostProcess?: (image: IImage) => IImage;
  constructor(
    imageVolumeProperties: ImageVolumeProps,
    streamingProperties: IStreamingVolumeProperties
  ) {
    // Just for fallback to the old API
    if (!imageVolumeProperties.imageIds) {
      imageVolumeProperties.imageIds = streamingProperties.imageIds;
    }
    super(imageVolumeProperties, streamingProperties);
  }
  public setImagePostProcess(fn: (image: IImage) => IImage) {
    this.imagePostProcess = fn;
  }

  // Override successCallback to apply post-process if set
  public override successCallback(imageId: string, image: IImage) {
    console.log('🔧 StreamingImageVolume: successCallback called with:', {
      imageId,
      hasPostProcess: !!this.imagePostProcess,
      imageDimensions: `${image.rows}x${image.columns}`,
      pixelDataLength: image.getPixelData().length,
    });

    if (this.imagePostProcess) {
      try {
        const originalImage = image;
        image = this.imagePostProcess(image) || image;
      } catch (e) {
        console.warn('imagePostProcess failed, using original image', e);
      }
    }
    super.successCallback(imageId, image);
  }

  /**
   * Return the scalar data (buffer)
   * @returns volume scalar data
   */
  public getScalarData(): PixelDataTypedArray {
    return <PixelDataTypedArray>this.voxelManager.getScalarData();
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
    const { imageIds } = this;

    return this.getImageIdsRequests(imageIds, priority);
  }

  public getImageIdsToLoad = () => {
    const { imageIds } = this;
    this.numFrames = imageIds.length;
    return imageIds;
  };
}
