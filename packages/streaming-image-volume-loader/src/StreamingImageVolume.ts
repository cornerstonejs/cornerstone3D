import { Types } from '@cornerstonejs/core';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';

/**
 * Streaming Image Volume Class that extends ImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingImageVolume extends BaseStreamingImageVolume {
  constructor(
    imageVolumeProperties: Types.IVolume,
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties, streamingProperties);
  }

  /**
   * Return the scalar data (buffer)
   * @returns volume scalar data
   */
  public getScalarData(): Types.VolumeScalarData {
    return <Types.VolumeScalarData>this.scalarData;
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
  public getImageLoadRequests = (priority: number) => {
    const { imageIds } = this;
    const scalarData = <Types.VolumeScalarData>this.scalarData;

    return this.getImageIdsRequests(imageIds, scalarData, priority);
  };
}
