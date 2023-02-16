import type { Types } from '@cornerstonejs/core';
import StreamingImageVolume from './StreamingImageVolume';

/**
 * Streaming Image Volume Class that extends StreamingImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingDynamicImageVolume extends StreamingImageVolume {
  constructor(
    imageVolumeProperties: Types.IVolume,
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties, streamingProperties);

    this.imageIds = streamingProperties.timePointsData.timePoints.reduce(
      (acc, cur) => acc.concat(cur.imageIds),
      []
    );

    this.timePointsData = streamingProperties.timePointsData;
    this.initialize();
  }

  private _getTimePointsToLoad(timePointIndex?: number) {
    const { timePoints } = this.timePointsData;
    const returnAllTimePoints = timePointIndex === undefined;

    timePointIndex = timePointIndex ?? this.timePointsData.activeTimePointIndex;

    if (timePointIndex < 0 || timePointIndex >= timePoints.length) {
      throw new Error('timePointIndex out of bounds');
    }

    const timePointsToLoad = [timePoints[timePointIndex]];

    if (returnAllTimePoints) {
      let leftIndex = timePointIndex - 1;
      let rightIndex = timePointIndex + 1;

      while (leftIndex >= 0 || rightIndex < timePoints.length) {
        if (leftIndex >= 0) {
          timePointsToLoad.push(timePoints[leftIndex--]);
        }

        if (rightIndex < timePoints.length) {
          timePointsToLoad.push(timePoints[rightIndex++]);
        }
      }
    }

    return timePointsToLoad;
  }

  private _getTimePointRequests = (timePoint, priority: number) => {
    const { imageIds, scalarData } = timePoint;

    return this.getImageIdsRequests(imageIds, scalarData, priority);
  };

  private _getTimePointsRequests = (
    priority: number,
    options: {
      timePointIndex?: number;
    } = {}
  ) => {
    const timePoints = this._getTimePointsToLoad(options.timePointIndex);
    let timePointsRequests = [];

    timePoints.forEach((timePoint) => {
      const timePointRequests = this._getTimePointRequests(timePoint, priority);
      timePointsRequests = timePointsRequests.concat(timePointRequests);
    });

    return timePointsRequests;
  };

  protected imageIdIndexToFrameIndex(imageIdIndex: number): number {
    return imageIdIndex % this.numFrames;
  }

  protected initialize(): void {
    if (this.timePointsData) {
      super.initialize();
    }
  }

  public get numFrames(): number {
    return this.timePointsData?.timePoints[0].imageIds.length ?? 0;
  }

  public getScalarDataArrays(): Array<Float32Array | Uint8Array> {
    return (
      this.timePointsData?.timePoints.map(({ scalarData }) => scalarData) ?? []
    );
  }

  public getActiveScalarData(): Float32Array | Uint8Array {
    const timePointIndex = this.getActiveTimePointIndex();
    return this.timePointsData?.timePoints[timePointIndex].scalarData;
  }

  public getScalarDataByImageIdIndex(
    imageIdIndex: number
  ): Float32Array | Uint8Array {
    if (imageIdIndex < 0 || imageIdIndex >= this.imageIds.length) {
      throw new Error('imageIdIndex out of range');
    }

    const timePointIndex = Math.floor(imageIdIndex / this.numFrames);
    return this.timePointsData?.timePoints[timePointIndex].scalarData;
  }

  public getTimePointsCount(): number {
    return this.timePointsData.timePoints.length;
  }

  public getActiveTimePointIndex(): number {
    return this.timePointsData.activeTimePointIndex ?? 0;
  }

  public setTimePointIndex(timePointIndex: number): void {
    if (timePointIndex < 0 || timePointIndex >= this.getTimePointsCount()) {
      throw new Error('Invalid timePointIndex');
    }

    const { imageData, timePointsData } = this;

    timePointsData.activeTimePointIndex = timePointIndex;
    imageData.getPointData().setActiveScalars(`timePoint-${timePointIndex}`);
    this.invalidateVolume();
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
    return this._getTimePointsRequests(priority);
  };
}
