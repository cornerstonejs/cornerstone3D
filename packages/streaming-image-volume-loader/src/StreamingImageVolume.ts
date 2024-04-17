import { Types } from '@cornerstonejs/core';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';
import ImageLoadRequests from './types/ImageLoadRequests';

/**
 * Streaming Image Volume Class that extends ImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingImageVolume extends BaseStreamingImageVolume {
  constructor(
    imageVolumeProperties: Types.ImageVolumeProps,
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    // Just for fallback to the old API
    if (!imageVolumeProperties.imageIds) {
      imageVolumeProperties.imageIds = streamingProperties.imageIds;
    }
    super(imageVolumeProperties, streamingProperties);
  }

  /**
   * Return the scalar data (buffer)
   * @returns volume scalar data
   */
  public getScalarData(): Types.PixelDataTypedArray {
    return <Types.PixelDataTypedArray>this.scalarData;
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
